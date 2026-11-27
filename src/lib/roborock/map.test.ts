import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { describe, test, expect } from "vitest";

import { parseRoborockMap } from "../maps/roborock_map";

import { roborockApiOf, RoborockDeviceApi } from "./device";
import { fakeMqtt } from "./fake_mqtt.test.mock";
import type { RoborockRriot } from "./hawk";
import { MapResponseAssembler } from "./map_response";
import { RoborockProtocol, type RoborockMessage } from "./message";
import { RoborockMqttConnection, RoborockMqttSession } from "./mqtt";

const LOCAL_KEY = "abcdefghijklmnop";
const rriot: RoborockRriot = {
  u: "u",
  s: "s",
  h: "h",
  k: "k",
  r: { r: "EU", a: "https://api", m: "ssl://mqtt:8883" },
};
const MAP_FILE = gunzipSync(
  fs.readFileSync(
    path.join(
      __dirname,
      "../__fixtures__/maps/roborock/S5_FW1886_with_forbidden_zones_and_virtual_walls_and_currently_cleaned_zones.bin.gz",
    ),
  ),
);

const ENDPOINT = "abcdefgh";
const NONCE = crypto.randomBytes(16);

/**
 * @param requestId The request ID in the header
 * @param data The map file
 * @param endpoint The endpoint in the header
 * @returns The payload of a map response
 */
function mapPayload(requestId: number, data: Buffer, endpoint = ENDPOINT) {
  const header = Buffer.alloc(24);
  header.write(endpoint, 0, "latin1");
  header.writeUInt16LE(requestId, 16);
  const cipher = crypto.createCipheriv("aes-128-cbc", NONCE, Buffer.alloc(16));
  return Buffer.concat([header, cipher.update(gzipSync(data)), cipher.final()]);
}

const message = (
  protocol: number,
  seq: number,
  payload: Buffer,
): RoborockMessage => ({
  version: "1.0",
  seq,
  random: 1,
  timestamp: 2,
  protocol,
  payload,
});

describe("MapResponseAssembler", () => {
  test("a map in a single message", () => {
    const assembler = new MapResponseAssembler(ENDPOINT, NONCE);
    expect(
      assembler.push(
        message(RoborockProtocol.MAP_RESPONSE, 1, mapPayload(42, MAP_FILE)),
      ),
    ).toStrictEqual({ requestId: 42, data: MAP_FILE });
  });

  test("a map in several parts, out of order", () => {
    const assembler = new MapResponseAssembler(ENDPOINT, NONCE);
    const payload = mapPayload(7, MAP_FILE);
    const third = Math.ceil(payload.length / 3);
    const parts = [0, 1, 2].map((i) =>
      payload.subarray(i * third, (i + 1) * third),
    );
    expect(
      assembler.push(message(RoborockProtocol.MAP_RESPONSE, 12, parts[2])),
    ).toBeUndefined();
    expect(
      assembler.push(message(RoborockProtocol.MAP_RESPONSE_PART, 10, parts[0])),
    ).toBeUndefined();
    expect(
      assembler.push(message(RoborockProtocol.MAP_RESPONSE_PART, 11, parts[1])),
    ).toStrictEqual({ requestId: 7, data: MAP_FILE });
  });

  test("ignores other messages and other clients' maps; fails on undecodable maps", () => {
    const assembler = new MapResponseAssembler(ENDPOINT, NONCE);
    expect(
      assembler.push(
        message(RoborockProtocol.RPC_RESPONSE, 1, Buffer.from("{}")),
      ),
    ).toBeUndefined();
    expect(
      assembler.push(
        message(
          RoborockProtocol.MAP_RESPONSE,
          1,
          mapPayload(1, MAP_FILE, "otherxyz"),
        ),
      ),
    ).toBeUndefined();
    const corrupted = Buffer.concat([
      mapPayload(1, MAP_FILE).subarray(0, 24),
      Buffer.alloc(32, 1),
    ]);
    expect(() =>
      assembler.push(message(RoborockProtocol.MAP_RESPONSE, 1, corrupted)),
    ).toThrow("Couldn't decode the map");
  });
});

describe("maps over MQTT", () => {
  test.each([
    ["a single message", 1, false],
    ["3 parts, out of order", 3, true],
  ])("getMapData: %s", async (_, parts, reverse) => {
    const broker = fakeMqtt(LOCAL_KEY, { get_map_v1: ["ok"] });
    broker.options.map = MAP_FILE;
    broker.options.mapParts = parts;
    broker.options.reverseParts = reverse;
    const session = new RoborockMqttSession(rriot, { connect: broker.connect });
    const connection = new RoborockMqttConnection(session, {
      duid: "d",
      localKey: LOCAL_KEY,
    });
    try {
      expect((await connection.getMapData()).equals(MAP_FILE)).toBe(true);
      expect(broker.requests[0].request).toMatchObject({
        method: "get_map_v1",
        security: { nonce: connection.nonce.toString("hex") },
      });
    } finally {
      await connection.close();
      await session.close();
    }
  });

  test("getMapData: the robot's error", async () => {
    const broker = fakeMqtt(LOCAL_KEY, {
      get_map_v1: () => ({ error: { code: -1, message: "no map" } }),
    });
    const session = new RoborockMqttSession(rriot, { connect: broker.connect });
    const connection = new RoborockMqttConnection(session, {
      duid: "d",
      localKey: LOCAL_KEY,
    });
    try {
      await expect(connection.getMapData(500)).rejects.toThrow(
        "get_map_v1 failed: no map",
      );
    } finally {
      await connection.close();
      await session.close();
    }
  });

  test("RoborockDeviceApi.getMap parses it; without MQTT it's not available", async () => {
    const broker = fakeMqtt(LOCAL_KEY, { get_map_v1: ["ok"] });
    broker.options.map = MAP_FILE;
    const mqtt = new RoborockMqttSession(rriot, { connect: broker.connect });
    const api = new RoborockDeviceApi({
      duid: "d",
      localKey: LOCAL_KEY,
      model: "roborock.vacuum.a296",
      address: "127.0.0.1",
      mqtt,
    });
    try {
      expect(await api.getMap()).toStrictEqual(parseRoborockMap(MAP_FILE));
    } finally {
      api.close();
      await mqtt.close();
    }
    const local = new RoborockDeviceApi({
      duid: "d",
      localKey: LOCAL_KEY,
      model: "roborock.vacuum.a296",
      address: "127.0.0.1",
    });
    await expect(local.getMap()).rejects.toThrow(
      "The map is only available with the account's MQTT session",
    );
    local.close();
  });
});

describe("roborockApiOf", () => {
  test("only for Roborock devices", () => {
    const api = new RoborockDeviceApi({
      duid: "d",
      localKey: LOCAL_KEY,
      model: "m",
      address: "127.0.0.1",
    });
    expect(roborockApiOf({ handle: { api } })).toBe(api);
    expect(roborockApiOf({ handle: { api: {} } })).toBeUndefined();
    expect(roborockApiOf(undefined)).toBeUndefined();
    api.close();
  });
});
