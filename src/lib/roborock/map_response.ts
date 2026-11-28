/**
 * The map responses of `get_map_v1` over MQTT (protocols 300/301).
 *
 * ```
 * endpoint (8, ASCII) | ? (8) | request id u16 LE | ? (6) | AES-128-CBC(gzip(map file)), key = the request's nonce, IV = 0
 * ```
 *
 * Large maps are split in several messages sharing `random` and `timestamp`, numbered by `seq`: all but the last are
 * protocol 300, the last one 301; only the first part has the header. Parts may arrive out of order.
 *
 * Format documented by python-roborock (Apache-2.0), `roborock/protocols/v1_protocol.py`. No code is copied from it.
 */
import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";

import { RoborockError } from "./errors.js";
import { RoborockProtocol, type RoborockMessage } from "./message.js";

const HEADER_LENGTH = 24;
/** Incomplete multi-part responses kept while waiting for their missing parts */
const MAX_PENDING = 4;

export interface MapResponse {
  requestId: number;
  /** The map file (decrypted and decompressed) */
  data: Buffer;
}

/**
 * Collects the parts of the map responses and decodes them once complete.
 */
export class MapResponseAssembler {
  private readonly endpoint: Buffer;
  private readonly pending = new Map<
    string,
    Map<number, { last: boolean; payload: Buffer }>
  >();

  /**
   * @param endpoint The `endpoint` of the requests' security block
   * @param nonce The `nonce` of the requests' security block (the AES key)
   */
  constructor(
    endpoint: string,
    private readonly nonce: Buffer,
  ) {
    this.endpoint = Buffer.from(endpoint, "latin1");
  }

  /**
   * @param message A received message
   * @returns The map, once all its parts arrived (`undefined` otherwise, or for maps requested by someone else)
   */
  push(message: RoborockMessage): MapResponse | undefined {
    if (
      message.protocol !== RoborockProtocol.MAP_RESPONSE &&
      message.protocol !== RoborockProtocol.MAP_RESPONSE_PART
    ) {
      return undefined;
    }
    const payload = message.payload;
    if (!payload?.length) {
      throw new RoborockError("Map response without payload");
    }
    const last = message.protocol === RoborockProtocol.MAP_RESPONSE;
    const key = `${message.random}:${message.timestamp}`;
    if (last && !this.pending.has(key) && this.isFirstPart(payload)) {
      return this.decode(payload);
    }

    const parts = this.pending.get(key) ?? new Map();
    this.pending.delete(key);
    parts.set(message.seq, { last, payload });
    const ordered = [...parts.entries()].sort(([a], [b]) => a - b);
    const first = ordered[0];
    const lastPart = ordered[ordered.length - 1];
    const complete =
      lastPart[1].last &&
      lastPart[0] - first[0] === ordered.length - 1 &&
      this.isFirstPart(first[1].payload);
    if (!complete) {
      this.pending.set(key, parts);
      while (this.pending.size > MAX_PENDING) {
        this.pending.delete(this.pending.keys().next().value as string);
      }
      return undefined;
    }
    return this.decode(Buffer.concat(ordered.map(([, part]) => part.payload)));
  }

  private isFirstPart(payload: Buffer) {
    return (
      payload.length >= this.endpoint.length &&
      payload.subarray(0, this.endpoint.length).equals(this.endpoint)
    );
  }

  private decode(payload: Buffer): MapResponse | undefined {
    if (payload.length < HEADER_LENGTH) {
      throw new RoborockError("Map response too short");
    }
    // Another client's map (same account): not ours
    if (!this.isFirstPart(payload)) return undefined;
    const requestId = payload.readUInt16LE(16);
    let data: Buffer;
    try {
      const decipher = crypto.createDecipheriv(
        "aes-128-cbc",
        this.nonce,
        Buffer.alloc(16),
      );
      data = gunzipSync(
        Buffer.concat([
          decipher.update(payload.subarray(HEADER_LENGTH)),
          decipher.final(),
        ]),
      );
    } catch (err) {
      throw new RoborockError(
        `Couldn't decode the map: ${(err as Error).message}`,
      );
    }
    return { requestId, data };
  }
}
