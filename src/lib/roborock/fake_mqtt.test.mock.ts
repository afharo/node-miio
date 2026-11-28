import crypto from "node:crypto";
import { gzipSync } from "node:zlib";

import {
  decodeMessage,
  encodeMessage,
  RoborockProtocol,
  type RoborockMessage,
} from "./message.js";
import type { MqttClientLike, MqttConnect } from "./mqtt.js";

type Responses = Record<string, unknown | ((params: unknown) => unknown)>;

/**
 * A fake MQTT broker with a robot behind it: answers the RPC requests published to `rr/m/i/…/{duid}` on
 * `rr/m/o/…/{duid}`.
 *
 * @param localKey The robot's local key
 * @param responses The result of each method (a function receives the params)
 * @returns The `connect` function, the received requests, a way to push messages, and the options
 */
export function fakeMqtt(localKey: string, responses: Responses) {
  const requests: {
    topic: string;
    message: RoborockMessage;
    request: {
      id: number;
      method: string;
      params: unknown;
      security?: unknown;
    };
  }[] = [];
  const listeners: ((topic: string, payload: Buffer) => void)[] = [];
  const subscriptions = new Set<string>();
  const options: {
    silent: boolean;
    connections: number;
    failConnect: boolean;
    /** The map file sent for get_map_v1 */
    map?: Buffer;
    /** In how many messages the map is sent */
    mapParts: number;
    /** Send the parts in reverse order */
    reverseParts: boolean;
  } = {
    silent: false,
    connections: 0,
    failConnect: false,
    mapParts: 1,
    reverseParts: false,
  };
  let robotSeq = 500;

  const deliver = (topic: string, message: RoborockMessage) => {
    if (!subscriptions.has(topic)) return;
    const payload = encodeMessage(message, localKey);
    setImmediate(() => listeners.forEach((l) => l(topic, payload)));
  };

  const sendMap = (
    topic: string,
    request: { id: number; security?: { endpoint: string; nonce: string } },
    message: RoborockMessage,
  ) => {
    const security = request.security as { endpoint: string; nonce: string };
    const header = Buffer.alloc(24);
    header.write(security.endpoint, 0, "latin1");
    header.writeUInt16LE(request.id, 16);
    const cipher = crypto.createCipheriv(
      "aes-128-cbc",
      Buffer.from(security.nonce, "hex"),
      Buffer.alloc(16),
    );
    const body = Buffer.concat([
      header,
      cipher.update(gzipSync(options.map as Buffer)),
      cipher.final(),
    ]);
    const size = Math.ceil(body.length / options.mapParts);
    const parts = Array.from({ length: options.mapParts }, (_, i) => ({
      version: "1.0",
      seq: 1 + i,
      random: 777,
      timestamp: message.timestamp,
      protocol:
        i === options.mapParts - 1
          ? RoborockProtocol.MAP_RESPONSE
          : RoborockProtocol.MAP_RESPONSE_PART,
      payload: body.subarray(i * size, (i + 1) * size),
    }));
    if (options.reverseParts) parts.reverse();
    for (const part of parts) deliver(topic, part);
  };

  const client: MqttClientLike = {
    on(event: string, listener: (...args: never[]) => void) {
      if (event === "message") {
        listeners.push(listener as (topic: string, payload: Buffer) => void);
      }
      return client;
    },
    async subscribeAsync(topic) {
      subscriptions.add(topic);
    },
    async unsubscribeAsync(topic) {
      subscriptions.delete(topic);
    },
    async publishAsync(topic, payload) {
      const message = decodeMessage(payload, localKey);
      const request = JSON.parse(
        JSON.parse(String(message.payload)).dps["101"],
      );
      requests.push({ topic, message, request });
      if (options.silent) return;
      if (request.method === "get_map_v1" && options.map) {
        sendMap(topic.replace("rr/m/i/", "rr/m/o/"), request, message);
      }
      const response = responses[request.method];
      const body =
        response === undefined
          ? { id: request.id, result: "unknown_method" }
          : typeof response === "function"
            ? {
                id: request.id,
                ...(response as (p: unknown) => object)(request.params),
              }
            : { id: request.id, result: response };
      deliver(topic.replace("rr/m/i/", "rr/m/o/"), {
        version: "1.0",
        seq: ++robotSeq,
        random: 1,
        timestamp: message.timestamp,
        protocol: RoborockProtocol.RPC_RESPONSE,
        payload: Buffer.from(
          JSON.stringify({ dps: { "102": JSON.stringify(body) } }),
        ),
      });
    },
    async endAsync() {},
  };

  const connect: MqttConnect = async (url, connectOptions) => {
    options.connections++;
    if (options.failConnect) throw new Error("connection refused");
    lastConnect = { url, ...connectOptions };
    return client;
  };
  let lastConnect: Record<string, unknown> | undefined;

  return {
    connect,
    requests,
    options,
    get lastConnect() {
      return lastConnect;
    },
    /**
     * @param topic The robot's topic (`rr/m/o/…`)
     * @param dps The data points pushed
     */
    push(topic: string, dps: Record<string, unknown>) {
      deliver(topic, {
        version: "1.0",
        seq: ++robotSeq,
        random: 2,
        timestamp: Math.floor(Date.now() / 1000),
        protocol: RoborockProtocol.GENERAL_REQUEST,
        payload: Buffer.from(JSON.stringify({ dps })),
      });
    },
  };
}
