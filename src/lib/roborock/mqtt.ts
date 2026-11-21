/**
 * The MQTT connection of a Roborock account: the cloud path to its robots (what the Roborock app uses away from home).
 *
 * - Broker: `rriot.r.m` (e.g. `ssl://mqtt-eu-3.roborock.com:8883`). Username `md5(u:k)[2:10]`, password `md5(s:k)[16:]`.
 * - Topics: requests to `rr/m/i/{u}/{username}/{duid}`, responses and pushes from `rr/m/o/{u}/{username}/{duid}`.
 * - Messages: the same `1.0` messages as the local connection, without the length prefix, as `RPC_REQUEST` (101) with a
 *   `security` block (`endpoint`, `nonce`: the nonce encrypts the maps sent back).
 *
 * Documented by python-roborock (Apache-2.0), `roborock/protocol.py` and `roborock/devices/transport/mqtt_channel.py`.
 * No code is copied from it.
 */
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

import { createDebug, type MiioLogger } from "../logger";

import { RoborockError } from "./errors";
import type { RoborockRriot } from "./hawk";
import {
  decodeMessage,
  encodeMessage,
  RoborockProtocol,
  rpcPayload,
  rpcResponse,
  rpcResult,
  type RoborockMessage,
} from "./message";

const md5hex = (value: string) =>
  crypto.createHash("md5").update(value).digest("hex");

/** The minimal MQTT client used (mqtt.js' `MqttClient`), injectable for tests */
export interface MqttClientLike {
  on(
    event: "message",
    listener: (topic: string, payload: Buffer) => void,
  ): unknown;
  on(event: "close" | "connect", listener: () => void): unknown;
  subscribeAsync(topic: string): Promise<unknown>;
  unsubscribeAsync(topic: string): Promise<unknown>;
  publishAsync(topic: string, payload: Buffer): Promise<unknown>;
  endAsync(): Promise<void>;
}

export type MqttConnect = (
  url: string,
  options: {
    username: string;
    password: string;
    clientId: string;
    connectTimeout: number;
    reconnectPeriod: number;
    keepalive: number;
  },
) => Promise<MqttClientLike>;

/**
 * Connects with mqtt.js, loaded on first use. Its typings need DOM/worker types, so it's loaded untyped: only
 * `connectAsync` is used, through {@link MqttClientLike}.
 *
 * @param url The broker URL
 * @param options The connection options
 * @returns The client
 */
const defaultConnect: MqttConnect = async (url, options) => {
  const moduleName = "mqtt";
  const mqtt = (await import(moduleName)) as {
    connectAsync: MqttConnect;
  };
  return mqtt.connectAsync(url, options);
};

/**
 * @param rriot The account's `rriot` credentials
 * @returns The broker URL and credentials
 */
export function mqttParams(rriot: RoborockRriot) {
  const url = new URL(rriot.r.m);
  const tls = url.protocol === "ssl:" || url.protocol === "mqtts:";
  return {
    url: `${tls ? "mqtts" : "mqtt"}://${url.hostname}:${url.port || (tls ? 8883 : 1883)}`,
    username: md5hex(`${rriot.u}:${rriot.k}`).slice(2, 10),
    password: md5hex(`${rriot.s}:${rriot.k}`).slice(16),
  };
}

export interface RoborockMqttSessionOptions {
  /** Injectable MQTT client (tests). Default: mqtt.js */
  connect?: MqttConnect;
  /** Timeout of the connection (default 15s) */
  timeoutMs?: number;
  logger?: MiioLogger;
}

/**
 * The MQTT connection of an account, shared by its robots.
 */
export class RoborockMqttSession {
  private client?: Promise<MqttClientLike>;
  private readonly handlers = new Map<string, Set<(payload: Buffer) => void>>();
  private readonly params;
  private readonly debug;

  constructor(
    private readonly rriot: RoborockRriot,
    private readonly options: RoborockMqttSessionOptions = {},
  ) {
    this.params = mqttParams(rriot);
    this.debug = createDebug("miio:roborock:mqtt", () => options.logger);
  }

  private topic(direction: "i" | "o", duid: string) {
    return `rr/m/${direction}/${this.rriot.u}/${this.params.username}/${duid}`;
  }

  private connect(): Promise<MqttClientLike> {
    this.client ??= (async () => {
      const connect = this.options.connect ?? defaultConnect;
      this.debug(`Connecting to ${this.params.url}`);
      const client = await connect(this.params.url, {
        username: this.params.username,
        password: this.params.password,
        clientId: crypto.randomBytes(8).toString("hex"),
        connectTimeout: this.options.timeoutMs ?? 15_000,
        reconnectPeriod: 10_000,
        keepalive: 60,
      });
      client.on("message", (topic, payload) => {
        for (const handler of this.handlers.get(topic) ?? []) handler(payload);
      });
      client.on("connect", () => {
        // After a reconnection: subscribe again
        for (const topic of this.handlers.keys()) {
          client.subscribeAsync(topic).catch(() => {});
        }
      });
      return client;
    })().catch((err) => {
      this.client = undefined;
      throw new RoborockError(
        `Couldn't connect to Roborock's MQTT server: ${(err as Error).message}`,
      );
    });
    return this.client;
  }

  /**
   * @param duid The robot's ID
   * @param handler Called with every message the robot sends
   * @returns Unsubscribes
   */
  async subscribe(duid: string, handler: (payload: Buffer) => void) {
    const client = await this.connect();
    const topic = this.topic("o", duid);
    let handlers = this.handlers.get(topic);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(topic, handlers);
      await client.subscribeAsync(topic);
    }
    handlers.add(handler);
    return async () => {
      handlers.delete(handler);
      if (handlers.size === 0 && this.handlers.get(topic) === handlers) {
        this.handlers.delete(topic);
        await client.unsubscribeAsync(topic).catch(() => {});
      }
    };
  }

  /**
   * @param duid The robot's ID
   * @param payload The encoded message
   */
  async publish(duid: string, payload: Buffer) {
    const client = await this.connect();
    await client.publishAsync(this.topic("i", duid), payload);
  }

  /** The `endpoint` of the requests' security block: identifies this account's requests in the map responses */
  get endpoint() {
    return crypto
      .createHash("md5")
      .update(this.rriot.k)
      .digest()
      .subarray(8, 14)
      .toString("base64");
  }

  /** Closes the connection */
  async close() {
    const client = this.client;
    this.client = undefined;
    this.handlers.clear();
    await (await client?.catch(() => undefined))?.endAsync();
  }
}

export interface RoborockMqttConnectionOptions {
  duid: string;
  localKey: string;
  /** Timeout of each request (default 10s) */
  timeoutMs?: number;
  logger?: MiioLogger;
}

/** Unix time in seconds */
const now = () => Math.floor(Date.now() / 1000);

/**
 * A robot over the account's MQTT connection.
 *
 * Events: `message` (every message received, e.g. status pushes).
 */
export class RoborockMqttConnection extends EventEmitter {
  private unsubscribe?: Promise<() => Promise<void>>;
  private readonly waiting = new Set<(message: RoborockMessage) => boolean>();
  private seq = 0;
  /** Encrypts the maps sent back (map responses come later) */
  readonly nonce = crypto.randomBytes(16);
  private readonly debug;

  constructor(
    private readonly session: RoborockMqttSession,
    private readonly options: RoborockMqttConnectionOptions,
  ) {
    super();
    this.debug = createDebug(
      `miio:roborock:mqtt:${options.duid}`,
      () => options.logger,
    );
  }

  private get timeoutMs() {
    return this.options.timeoutMs ?? 10_000;
  }

  private subscribed() {
    this.unsubscribe ??= this.session
      .subscribe(this.options.duid, (payload) => this.onPayload(payload))
      .catch((err) => {
        this.unsubscribe = undefined;
        throw err;
      });
    return this.unsubscribe;
  }

  private onPayload(payload: Buffer) {
    let message: RoborockMessage;
    try {
      message = decodeMessage(payload, this.options.localKey);
    } catch (err) {
      this.debug(`Ignoring a message: ${(err as Error).message}`);
      return;
    }
    for (const matcher of this.waiting) {
      if (matcher(message)) this.waiting.delete(matcher);
    }
    this.emit("message", message);
  }

  /**
   * Calls a method on the robot (the same methods as miIO: `get_status`, `app_start`…).
   *
   * @param method The method
   * @param params The params
   * @returns The result
   */
  async call<T = unknown>(method: string, params: unknown = []): Promise<T> {
    await this.subscribed();
    const id = crypto.randomInt(10000, 32767);
    const timestamp = now();
    this.seq = this.seq >= 0x7fffffff ? 1 : this.seq + 1;
    const message = encodeMessage(
      {
        version: "1.0",
        seq: this.seq,
        random: crypto.randomInt(10000, 99999),
        timestamp,
        protocol: RoborockProtocol.RPC_REQUEST,
        payload: rpcPayload(
          {
            id,
            method,
            params,
            security: {
              endpoint: this.session.endpoint,
              nonce: this.nonce.toString("hex"),
            },
          },
          timestamp,
        ),
      },
      this.options.localKey,
    );
    this.debug(`-> ${method} (${id})`, JSON.stringify(params));
    const response = await new Promise<RoborockMessage>((resolve, reject) => {
      const matcher = (received: RoborockMessage) => {
        if (rpcResponse(received)?.id !== id) return false;
        clearTimeout(timer);
        resolve(received);
        return true;
      };
      const timer = setTimeout(() => {
        this.waiting.delete(matcher);
        reject(
          new RoborockError(`No response over MQTT after ${this.timeoutMs} ms`),
        );
      }, this.timeoutMs);
      this.waiting.add(matcher);
      this.session.publish(this.options.duid, message).catch((err) => {
        clearTimeout(timer);
        this.waiting.delete(matcher);
        reject(err);
      });
    });
    const rpc = rpcResponse(response) as NonNullable<
      ReturnType<typeof rpcResponse>
    >;
    this.debug(`<- ${method} (${id})`, JSON.stringify(rpc.result ?? rpc.error));
    return rpcResult<T>(method, rpc);
  }

  /** Stops listening to the robot (the account's session stays open) */
  async close() {
    for (const matcher of this.waiting) this.waiting.delete(matcher);
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = undefined;
    await (
      await unsubscribe?.catch(() => undefined)
    )?.();
  }
}
