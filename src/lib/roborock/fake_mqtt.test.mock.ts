import {
  decodeMessage,
  encodeMessage,
  RoborockProtocol,
  type RoborockMessage,
} from "./message";
import type { MqttClientLike, MqttConnect } from "./mqtt";

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
  const options = { silent: false, connections: 0, failConnect: false };
  let robotSeq = 500;

  const deliver = (topic: string, message: RoborockMessage) => {
    if (!subscriptions.has(topic)) return;
    const payload = encodeMessage(message, localKey);
    setImmediate(() => listeners.forEach((l) => l(topic, payload)));
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
