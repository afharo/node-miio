import { Vacuum } from "../devices/vacuums/vacuum";

import { RoborockDeviceApi, roborockDevice } from "./device";
import { fakeMqtt } from "./fake_mqtt.test.mock";
import { fakeRobot, LOCAL_KEY } from "./fake_robot.test.mock";
import type { RoborockRriot } from "./hawk";
import { mqttParams, RoborockMqttSession } from "./mqtt";

const rriot: RoborockRriot = {
  u: "u",
  s: "s",
  h: "h",
  k: "k",
  r: { r: "EU", a: "https://api", m: "ssl://mqtt:8883" },
};
const topic = `rr/m/o/u/${mqttParams(rriot).username}/duid-1`;

describe("roborockDevice with MQTT", () => {
  test("finds the robot's IP over MQTT, then talks to it locally", async () => {
    const robot = await fakeRobot({
      get_status: [{ state: 8, battery: 90 }],
      get_consumable: [{}],
    });
    const broker = fakeMqtt(LOCAL_KEY, {
      get_network_info: { ip: "127.0.0.1" },
    });
    const mqtt = new RoborockMqttSession(rriot, { connect: broker.connect });
    const device = await roborockDevice({
      duid: "duid-1",
      localKey: LOCAL_KEY,
      model: "roborock.vacuum.a296",
      port: robot.port,
      mqtt,
    });
    try {
      expect(device).toBeInstanceOf(Vacuum);
      const api = (device as unknown as { handle: { api: RoborockDeviceApi } })
        .handle.api;
      expect(api.address).toBe("127.0.0.1");
      expect(api.localProtocolVersion).toBe("1.0");
      expect(api.transport).toBe("local");
      expect(broker.requests.map((r) => r.request.method)).toStrictEqual([
        "get_network_info",
      ]);
      expect(robot.calls.map((c) => c.method)).toContain("get_status");
    } finally {
      await device.destroy();
      await mqtt.close();
      await robot.close();
    }
  });

  test("uses MQTT when the robot can't be reached locally", async () => {
    const closed = await fakeRobot({});
    await closed.close();
    const broker = fakeMqtt(LOCAL_KEY, {
      get_status: [{ state: 8, battery: 55 }],
      get_consumable: [{}],
    });
    const mqtt = new RoborockMqttSession(rriot, { connect: broker.connect });
    const device = (await roborockDevice({
      duid: "duid-1",
      localKey: LOCAL_KEY,
      model: "roborock.vacuum.a296",
      address: "127.0.0.1",
      port: closed.port,
      mqtt,
      timeoutMs: 200,
    })) as unknown as Vacuum;
    try {
      expect(await device.batteryLevel()).toBe(55);
      const api = (device as unknown as { handle: { api: RoborockDeviceApi } })
        .handle.api;
      expect(api.transport).toBe("mqtt");
    } finally {
      await device.destroy();
      await mqtt.close();
    }
  });

  test("the robot's pushes refresh the properties", async () => {
    let state = 8;
    const broker = fakeMqtt(LOCAL_KEY, {
      get_network_info: {},
      get_status: () => ({ result: [{ state, battery: 100 }] }),
      get_consumable: [{}],
    });
    const mqtt = new RoborockMqttSession(rriot, { connect: broker.connect });
    const device = (await roborockDevice({
      duid: "duid-1",
      localKey: LOCAL_KEY,
      model: "roborock.vacuum.a296",
      mqtt,
    })) as unknown as Vacuum;
    try {
      expect(device.property("state")).toBe("charging");
      const changed = new Promise((resolve) =>
        device.on("stateChanged", (e: { key: string; value: unknown }) => {
          if (e.key === "cleaning") resolve(e.value);
        }),
      );
      state = 18;
      broker.push(topic, { "121": 18 });
      await expect(changed).resolves.toBe(true);
      expect(device.property("state")).toBe("room-cleaning");
    } finally {
      await device.destroy();
      await mqtt.close();
    }
  });

  test("asks for the IP once, not on every call", async () => {
    const broker = fakeMqtt(LOCAL_KEY, {
      get_network_info: {},
      get_status: [{ state: 8 }],
      get_consumable: [{}],
    });
    const mqtt = new RoborockMqttSession(rriot, { connect: broker.connect });
    const device = (await roborockDevice({
      duid: "duid-1",
      localKey: LOCAL_KEY,
      model: "roborock.vacuum.a296",
      mqtt,
    })) as unknown as Vacuum;
    try {
      await device.poll();
      await device.poll();
      const methods = broker.requests.map((r) => r.request.method);
      expect(methods.filter((m) => m === "get_network_info")).toHaveLength(1);
    } finally {
      await device.destroy();
      await mqtt.close();
    }
  });

  test("without IP nor MQTT", async () => {
    await expect(
      roborockDevice({
        duid: "d",
        localKey: LOCAL_KEY,
        model: "roborock.vacuum.a296",
      }),
    ).rejects.toThrow(
      "The robot's IP address is needed (or the account's MQTT session)",
    );
  });
});
