/**
 * The messages of Roborock robots (versions `1.0` and `L01`), used by the local (TCP 58867) and MQTT connections.
 *
 * ```
 * version "1.0" (3) | seq u32 | random u32 | timestamp u32 | protocol u16 | [payload length u16 | payload] | [crc32 u32]
 * ```
 *
 * The payload is AES-128-ECB encrypted (PKCS#7) with `md5(encodeTimestamp(timestamp) + localKey + SALT)`; the CRC32
 * covers everything before it. `L01` (newer local connections) uses AES-256-GCM instead: see {@link l01Cipher}. Over TCP, each message is prefixed with its length (u32). All integers are big-endian.
 *
 * Format documented by python-roborock (Apache-2.0), `roborock/protocol.py`. No code is copied from it.
 */
import crypto from "node:crypto";
import zlib from "node:zlib";

import { RoborockApiError, RoborockError } from "./errors";

const SALT = "TXdfu$jyZ#TZHsg4";
const HEADER_LENGTH = 3 + 4 + 4 + 4 + 2;

/** The message types (`protocol` field) */
export const RoborockProtocol = {
  HELLO_REQUEST: 0,
  HELLO_RESPONSE: 1,
  PING_REQUEST: 2,
  PING_RESPONSE: 3,
  /** RPC over the local connection */
  GENERAL_REQUEST: 4,
  GENERAL_RESPONSE: 5,
  /** RPC over MQTT */
  RPC_REQUEST: 101,
  RPC_RESPONSE: 102,
  MAP_RESPONSE_PART: 300,
  MAP_RESPONSE: 301,
} as const;

export interface RoborockMessage {
  version: string;
  seq: number;
  random: number;
  timestamp: number;
  protocol: number;
  /** The decrypted payload (usually JSON) */
  payload?: Buffer;
}

/**
 * @param timestamp Unix time in seconds
 * @returns The timestamp as 8 hex digits, shuffled the way the robots expect
 */
export function encodeTimestamp(timestamp: number) {
  const hex = (timestamp >>> 0).toString(16).padStart(8, "0");
  return [5, 6, 3, 7, 1, 2, 0, 4].map((i) => hex[i]).join("");
}

/**
 * @param timestamp The timestamp of the message
 * @param localKey The robot's local key
 * @returns The AES key of the message's payload
 */
function payloadKey(timestamp: number, localKey: string) {
  return crypto
    .createHash("md5")
    .update(encodeTimestamp(timestamp) + localKey + SALT)
    .digest();
}

/** The protocol versions of the messages: `1.0` (AES-ECB) or `L01` (AES-GCM, newer local connections) */
export type RoborockMessageVersion = "1.0" | "L01";

/**
 * The nonces of an `L01` connection, exchanged in the hello: `connectNonce` is the `random` of our hello,
 * `ackNonce` the `random` of the robot's response. Both are part of every message's authenticated data.
 */
export interface L01Nonces {
  connectNonce: number;
  ackNonce?: number;
}

/**
 * @param version The version of a message
 */
function checkVersion(
  version: string,
): asserts version is RoborockMessageVersion {
  if (version !== "1.0" && version !== "L01") {
    throw new RoborockError(`Protocol version ${version} is not supported yet`);
  }
}

const u32 = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
};

/**
 * @param message The message (its header)
 * @param localKey The robot's local key
 * @param nonces The connection's nonces
 * @returns The key, IV and authenticated data of an `L01` message (AES-256-GCM)
 */
function l01Cipher(
  message: RoborockMessage,
  localKey: string,
  nonces?: L01Nonces,
) {
  if (!nonces) {
    throw new RoborockError("L01 messages need the connection's nonces");
  }
  const key = crypto
    .createHash("sha256")
    .update(encodeTimestamp(message.timestamp) + localKey + SALT)
    .digest();
  const iv = crypto
    .createHash("sha256")
    .update(
      Buffer.concat([
        u32(message.seq),
        u32(message.random),
        u32(message.timestamp),
      ]),
    )
    .digest()
    .subarray(0, 12);
  const aad = Buffer.concat([
    u32(message.seq),
    u32(nonces.connectNonce),
    ...(nonces.ackNonce === undefined ? [] : [u32(nonces.ackNonce)]),
    u32(message.random),
    u32(message.timestamp),
  ]);
  return { key, iv, aad };
}

/**
 * @param message The message with its payload
 * @param localKey The robot's local key
 * @param nonces The connection's nonces (`L01` only)
 * @returns The encrypted payload
 */
function encryptPayload(
  message: RoborockMessage,
  localKey: string,
  nonces?: L01Nonces,
) {
  const payload = message.payload ?? Buffer.alloc(0);
  if (message.version === "L01") {
    const { key, iv, aad } = l01Cipher(message, localKey, nonces);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aad);
    return Buffer.concat([
      cipher.update(payload),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
  }
  const cipher = crypto.createCipheriv(
    "aes-128-ecb",
    payloadKey(message.timestamp, localKey),
    null,
  );
  return Buffer.concat([cipher.update(payload), cipher.final()]);
}

/**
 * @param message The message (its header)
 * @param encrypted The encrypted payload
 * @param localKey The robot's local key
 * @param nonces The connection's nonces (`L01` only)
 * @returns The decrypted payload
 */
function decryptPayload(
  message: RoborockMessage,
  encrypted: Buffer,
  localKey: string,
  nonces?: L01Nonces,
) {
  try {
    if (message.version === "L01") {
      const { key, iv, aad } = l01Cipher(message, localKey, nonces);
      if (encrypted.length < 16) throw new Error("payload too short");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(encrypted.subarray(-16));
      return Buffer.concat([
        decipher.update(encrypted.subarray(0, -16)),
        decipher.final(),
      ]);
    }
    const decipher = crypto.createDecipheriv(
      "aes-128-ecb",
      payloadKey(message.timestamp, localKey),
      null,
    );
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch (err) {
    if (err instanceof RoborockError) throw err;
    throw new RoborockError(
      `Couldn't decrypt the message (${(err as Error).message})`,
    );
  }
}

/**
 * @param message The message
 * @param localKey The robot's local key
 * @param nonces The connection's nonces (`L01` messages only)
 * @returns The encoded message (without the TCP length prefix)
 */
export function encodeMessage(
  message: RoborockMessage,
  localKey: string,
  nonces?: L01Nonces,
) {
  checkVersion(message.version);
  const header = Buffer.alloc(HEADER_LENGTH);
  header.write(message.version, 0, "latin1");
  header.writeUInt32BE(message.seq >>> 0, 3);
  header.writeUInt32BE(message.random >>> 0, 7);
  header.writeUInt32BE(message.timestamp >>> 0, 11);
  header.writeUInt16BE(message.protocol, 15);

  const parts = [header];
  if (message.payload) {
    const encrypted = encryptPayload(message, localKey, nonces);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(encrypted.length);
    parts.push(length, encrypted);
  }
  const body = Buffer.concat(parts);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([body, crc]);
}

/**
 * @param data One encoded message (without the TCP length prefix)
 * @param localKey The robot's local key
 * @param nonces The connection's nonces (`L01` messages only)
 * @returns The message
 */
export function decodeMessage(
  data: Buffer,
  localKey: string,
  nonces?: L01Nonces,
): RoborockMessage {
  if (data.length < HEADER_LENGTH) {
    throw new RoborockError(`Message too short (${data.length} bytes)`);
  }
  const message: RoborockMessage = {
    version: data.toString("latin1", 0, 3),
    seq: data.readUInt32BE(3),
    random: data.readUInt32BE(7),
    timestamp: data.readUInt32BE(11),
    protocol: data.readUInt16BE(15),
  };
  checkVersion(message.version);

  // Messages without payload may come with or without CRC
  const rest = data.length - HEADER_LENGTH;
  if (rest === 0 || rest === 4) return message;
  const length = data.readUInt16BE(HEADER_LENGTH);
  const end = HEADER_LENGTH + 2 + length;
  if (end > data.length) {
    throw new RoborockError("Message truncated");
  }
  if (data.length >= end + 4) {
    const crc = data.readUInt32BE(end);
    if (crc !== zlib.crc32(data.subarray(0, end))) {
      throw new RoborockError("Wrong message checksum");
    }
  }
  if (length > 0) {
    message.payload = decryptPayload(
      message,
      data.subarray(HEADER_LENGTH + 2, end),
      localKey,
      nonces,
    );
  }
  return message;
}

/**
 * @param message The encoded message
 * @returns The message with its TCP length prefix
 */
export function withLengthPrefix(message: Buffer) {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(message.length);
  return Buffer.concat([prefix, message]);
}

/**
 * Splits the TCP stream into messages (length-prefixed).
 */
export class LengthPrefixedReader {
  private buffer = Buffer.alloc(0);

  /**
   * @param chunk The data received
   * @returns The complete messages received so far (without their prefix)
   */
  push(chunk: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: Buffer[] = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0);
      if (this.buffer.length < 4 + length) break;
      messages.push(this.buffer.subarray(4, 4 + length));
      this.buffer = this.buffer.subarray(4 + length);
    }
    return messages;
  }
}

/** An RPC request, as sent in the payload (`dps.101`) */
export interface RoborockRpcRequest {
  id: number;
  method: string;
  params: unknown;
  security?: { endpoint: string; nonce: string };
}

/**
 * @param request The RPC request
 * @param timestamp Unix time in seconds
 * @returns The payload of an RPC message
 */
export function rpcPayload(request: RoborockRpcRequest, timestamp: number) {
  return Buffer.from(
    JSON.stringify({ dps: { "101": JSON.stringify(request) }, t: timestamp }),
  );
}

/**
 * @param message A received message
 * @returns The data points of its payload, by code (`102` = RPC response, `121`… = status pushes)
 */
export function dataPoints(
  message: RoborockMessage,
): Record<string, unknown> | undefined {
  if (!message.payload?.length) return undefined;
  try {
    const dps = JSON.parse(message.payload.toString("utf8"))?.dps;
    return dps && typeof dps === "object" ? dps : undefined;
  } catch {
    return undefined;
  }
}

export interface RoborockRpcResponse {
  id: number;
  result?: unknown;
  error?: { code?: number; message?: string } | string;
}

/**
 * @param message A received message
 * @returns The RPC response it carries, if any
 */
export function rpcResponse(
  message: RoborockMessage,
): RoborockRpcResponse | undefined {
  const value = dataPoints(message)?.["102"];
  if (typeof value !== "string") return undefined;
  try {
    const response = JSON.parse(value);
    return typeof response?.id === "number" ? response : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param method The method that was called
 * @param rpc Its response
 * @returns The result
 * @throws {RoborockApiError} If the robot returned an error, or doesn't know the method
 */
export function rpcResult<T>(method: string, rpc: RoborockRpcResponse): T {
  if (rpc.error !== undefined) {
    const error =
      typeof rpc.error === "string" ? { message: rpc.error } : rpc.error;
    throw new RoborockApiError(
      `${method} failed: ${error.message ?? JSON.stringify(error)}`,
      error.code,
    );
  }
  if (rpc.result === "unknown_method") {
    throw new RoborockApiError(
      `${method} is not supported by this robot`,
      "unknown_method",
    );
  }
  return rpc.result as T;
}
