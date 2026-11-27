import crypto from "node:crypto";
import zlib from "node:zlib";

import { describe, test, expect } from "vitest";

import {
  dataPoints,
  decodeMessage,
  encodeMessage,
  encodeTimestamp,
  LengthPrefixedReader,
  RoborockProtocol,
  rpcPayload,
  rpcResponse,
  withLengthPrefix,
} from "./message";

const KEY = "abcdefghijklmnop";

describe("Roborock messages", () => {
  test("encodeTimestamp shuffles the hex digits", () => {
    expect(encodeTimestamp(0x12345678)).toBe("67482315");
    expect(encodeTimestamp(0x1)).toBe(
      "00000001"
        .split("")
        .map((_, i, h) => h[[5, 6, 3, 7, 1, 2, 0, 4][i]])
        .join(""),
    );
  });

  test("encodes the header, the encrypted payload and the CRC", () => {
    const payload = rpcPayload(
      { id: 1, method: "get_status", params: [] },
      1700000000,
    );
    const encoded = encodeMessage(
      {
        version: "1.0",
        seq: 7,
        random: 9,
        timestamp: 1700000000,
        protocol: RoborockProtocol.GENERAL_REQUEST,
        payload,
      },
      KEY,
    );
    expect(encoded.toString("latin1", 0, 3)).toBe("1.0");
    expect(encoded.readUInt32BE(3)).toBe(7);
    expect(encoded.readUInt32BE(7)).toBe(9);
    expect(encoded.readUInt32BE(11)).toBe(1700000000);
    expect(encoded.readUInt16BE(15)).toBe(4);
    const length = encoded.readUInt16BE(17);
    expect(length % 16).toBe(0);
    // AES-128-ECB with md5(encodeTimestamp(ts) + localKey + salt)
    const key = crypto
      .createHash("md5")
      .update(encodeTimestamp(1700000000) + KEY + "TXdfu$jyZ#TZHsg4")
      .digest();
    const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
    const plain = Buffer.concat([
      decipher.update(encoded.subarray(19, 19 + length)),
      decipher.final(),
    ]);
    expect(JSON.parse(plain.toString())).toStrictEqual({
      dps: { "101": '{"id":1,"method":"get_status","params":[]}' },
      t: 1700000000,
    });
    expect(encoded.readUInt32BE(19 + length)).toBe(
      zlib.crc32(encoded.subarray(0, 19 + length)),
    );
  });

  test("round-trips, with and without payload", () => {
    const base = {
      version: "1.0",
      seq: 1,
      random: 2,
      timestamp: 3,
      protocol: 0,
    };
    expect(decodeMessage(encodeMessage(base, KEY), KEY)).toStrictEqual(base);
    // Without the CRC either
    expect(
      decodeMessage(encodeMessage(base, KEY).subarray(0, 17), KEY),
    ).toStrictEqual(base);
    const withPayload = {
      ...base,
      protocol: 5,
      payload: Buffer.from(
        '{"dps":{"102":"{\\"id\\":5,\\"result\\":[\\"ok\\"]}"}}',
      ),
    };
    const decoded = decodeMessage(encodeMessage(withPayload, KEY), KEY);
    expect(decoded).toStrictEqual(withPayload);
    expect(rpcResponse(decoded)).toStrictEqual({ id: 5, result: ["ok"] });
  });

  test("rejects a wrong checksum and unknown protocol versions", () => {
    const encoded = encodeMessage(
      {
        version: "1.0",
        seq: 1,
        random: 2,
        timestamp: 3,
        protocol: 4,
        payload: Buffer.from("{}"),
      },
      KEY,
    );
    encoded[encoded.length - 1] ^= 0xff;
    expect(() => decodeMessage(encoded, KEY)).toThrow("Wrong message checksum");
    const b01 = Buffer.from(encoded);
    b01.write("B01", 0, "latin1");
    expect(() => decodeMessage(b01, KEY)).toThrow(
      "Protocol version B01 is not supported yet",
    );
  });

  test("splits the TCP stream into messages", () => {
    const a = withLengthPrefix(Buffer.from("first"));
    const b = withLengthPrefix(Buffer.from("second"));
    const reader = new LengthPrefixedReader();
    const stream = Buffer.concat([a, b]);
    expect(reader.push(stream.subarray(0, 6))).toStrictEqual([]);
    expect(reader.push(stream.subarray(6, 15)).map(String)).toStrictEqual([
      "first",
    ]);
    expect(reader.push(stream.subarray(15)).map(String)).toStrictEqual([
      "second",
    ]);
  });

  test("dataPoints of status pushes", () => {
    const message = {
      version: "1.0",
      seq: 1,
      random: 1,
      timestamp: 1,
      protocol: 4,
      payload: Buffer.from('{"dps":{"121":8,"122":100}}'),
    };
    expect(dataPoints(message)).toStrictEqual({ "121": 8, "122": 100 });
    expect(rpcResponse(message)).toBeUndefined();
    expect(
      dataPoints({ ...message, payload: Buffer.from("not json") }),
    ).toBeUndefined();
  });
});

describe("L01 messages", () => {
  const nonces = { connectNonce: 12345, ackNonce: 4242 };
  const message = {
    version: "L01",
    seq: 2,
    random: 777,
    timestamp: 1700000000,
    protocol: RoborockProtocol.GENERAL_REQUEST,
    payload: Buffer.from('{"dps":{"101":"{}"}}'),
  };

  test("AES-256-GCM with the documented key, IV and authenticated data", () => {
    const encoded = encodeMessage(message, KEY, nonces);
    const length = encoded.readUInt16BE(17);
    const body = encoded.subarray(19, 19 + length);
    const u32 = (v: number) => {
      const b = Buffer.alloc(4);
      b.writeUInt32BE(v);
      return b;
    };
    const key = crypto
      .createHash("sha256")
      .update(encodeTimestamp(1700000000) + KEY + "TXdfu$jyZ#TZHsg4")
      .digest();
    const iv = crypto
      .createHash("sha256")
      .update(Buffer.concat([u32(2), u32(777), u32(1700000000)]))
      .digest()
      .subarray(0, 12);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(
      Buffer.concat([u32(2), u32(12345), u32(4242), u32(777), u32(1700000000)]),
    );
    decipher.setAuthTag(body.subarray(-16));
    const plain = Buffer.concat([
      decipher.update(body.subarray(0, -16)),
      decipher.final(),
    ]);
    expect(plain.toString()).toBe('{"dps":{"101":"{}"}}');
  });

  test("round-trips; other nonces fail to decrypt", () => {
    const encoded = encodeMessage(message, KEY, nonces);
    expect(decodeMessage(encoded, KEY, nonces)).toStrictEqual(message);
    expect(() =>
      decodeMessage(encoded, KEY, { ...nonces, ackNonce: 1 }),
    ).toThrow("Couldn't decrypt the message");
    expect(() => encodeMessage(message, KEY)).toThrow(
      "L01 messages need the connection's nonces",
    );
  });
});
