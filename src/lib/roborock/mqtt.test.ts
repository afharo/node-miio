import crypto from "node:crypto";

import { RoborockApiError } from "./errors";
import { fakeMqtt } from "./fake_mqtt.test.mock";
import type { RoborockRriot } from "./hawk";
import {
  mqttParams,
  RoborockMqttConnection,
  RoborockMqttSession,
} from "./mqtt";

const LOCAL_KEY = "abcdefghijklmnop";
const rriot: RoborockRriot = {
  u: "user-u",
  s: "sess-s",
  h: "h",
  k: "mqtt-k",
  r: {
    r: "EU",
    a: "https://api-eu.roborock.com",
    m: "ssl://mqtt-eu-3.roborock.com:8883",
  },
};
const md5 = (v: string) => crypto.createHash("md5").update(v).digest("hex");

describe("mqttParams", () => {
  test("broker URL and hashed credentials", () => {
    expect(mqttParams(rriot)).toStrictEqual({
      url: "mqtts://mqtt-eu-3.roborock.com:8883",
      username: md5("user-u:mqtt-k").slice(2, 10),
      password: md5("sess-s:mqtt-k").slice(16),
    });
    expect(
      mqttParams({ ...rriot, r: { ...rriot.r, m: "tcp://broker:1883" } }).url,
    ).toBe("mqtt://broker:1883");
  });
});

describe("RoborockMqttConnection", () => {
  test("calls over the account's topics, with the security block", async () => {
    const broker = fakeMqtt(LOCAL_KEY, { get_status: [{ state: 8 }] });
    const session = new RoborockMqttSession(rriot, { connect: broker.connect });
    const connection = new RoborockMqttConnection(session, {
      duid: "duid-1",
      localKey: LOCAL_KEY,
    });
    try {
      await expect(connection.call("get_status")).resolves.toStrictEqual([
        { state: 8 },
      ]);
      await connection.call("get_status");

      const { username } = mqttParams(rriot);
      expect(broker.lastConnect).toMatchObject({
        url: "mqtts://mqtt-eu-3.roborock.com:8883",
        username,
        password: mqttParams(rriot).password,
      });
      const [first, second] = broker.requests;
      expect(first.topic).toBe(`rr/m/i/user-u/${username}/duid-1`);
      expect(first.message.protocol).toBe(101);
      expect(first.request).toMatchObject({
        method: "get_status",
        params: [],
        security: {
          endpoint: crypto
            .createHash("md5")
            .update("mqtt-k")
            .digest()
            .subarray(8, 14)
            .toString("base64"),
          nonce: connection.nonce.toString("hex"),
        },
      });
      expect(second.message.seq).toBeGreaterThan(first.message.seq);
    } finally {
      await connection.close();
      await session.close();
    }
  });

  test("errors, unknown methods and timeouts", async () => {
    const broker = fakeMqtt(LOCAL_KEY, {
      app_charge: () => ({
        error: { code: -10007, message: "invalid status" },
      }),
    });
    const session = new RoborockMqttSession(rriot, { connect: broker.connect });
    const connection = new RoborockMqttConnection(session, {
      duid: "duid-1",
      localKey: LOCAL_KEY,
      timeoutMs: 100,
    });
    try {
      const error = (await connection
        .call("app_charge")
        .catch((e) => e)) as RoborockApiError;
      expect(error).toBeInstanceOf(RoborockApiError);
      expect(error.code).toBe(-10007);
      await expect(connection.call("nope")).rejects.toThrow(
        "nope is not supported by this robot",
      );
      broker.options.silent = true;
      await expect(connection.call("get_status")).rejects.toThrow(
        "No response over MQTT after 100 ms",
      );
    } finally {
      await connection.close();
      await session.close();
    }
  });

  test("one MQTT connection per account; failures are retried on the next call", async () => {
    const broker = fakeMqtt(LOCAL_KEY, { get_status: [] });
    broker.options.failConnect = true;
    const session = new RoborockMqttSession(rriot, { connect: broker.connect });
    const a = new RoborockMqttConnection(session, {
      duid: "a",
      localKey: LOCAL_KEY,
    });
    const b = new RoborockMqttConnection(session, {
      duid: "b",
      localKey: LOCAL_KEY,
    });
    try {
      await expect(a.call("get_status")).rejects.toThrow(
        "Couldn't connect to Roborock's MQTT server: connection refused",
      );
      broker.options.failConnect = false;
      await Promise.all([a.call("get_status"), b.call("get_status")]);
      expect(broker.options.connections).toBe(2);
    } finally {
      await session.close();
    }
  });
});
