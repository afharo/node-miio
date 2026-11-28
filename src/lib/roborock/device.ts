import { EventEmitter } from "node:events";

import type { DeviceApi } from "../device_info.js";
import type { IDevice } from "../device.js";
import { Vacuum } from "../devices/vacuums/vacuum.js";
import { createDebug, type MiioLogger } from "../logger.js";
import { MiioError } from "../miio_error.js";
import { models } from "../models.js";
import { parseRoborockMap, type RoborockMap } from "../maps/roborock_map.js";

import { RoborockApiError, RoborockError } from "./errors.js";
import { RoborockLocalConnection } from "./local_connection.js";
import {
  dataPoints,
  rpcResponse,
  type RoborockMessage,
  type RoborockMessageVersion,
} from "./message.js";
import { RoborockMqttConnection, type RoborockMqttSession } from "./mqtt.js";

/** After the local connection fails, how long to use MQTT only before trying it again */
const LOCAL_RETRY_MS = 60_000;
/** Pushes often come in bursts: refresh once */
const PUSH_REFRESH_DELAY_MS = 500;

export interface RoborockDeviceOptions {
  /** The robot's ID (`duid`, from the account's home data) */
  duid: string;
  /** The robot's local key (from the account's home data) */
  localKey: string;
  /** The model (from the account's home data), e.g. `roborock.vacuum.a296` */
  model: string;
  /**
   * The firmware version (from the account's home data: `firmwareVersion`). The robots don't answer `miIO.info`
   * over these connections: it's answered with the model and this version.
   */
  firmwareVersion?: string;
  /**
   * The robot's IP address. Optional with `mqtt`: it's asked to the robot (`get_network_info`).
   */
  address?: string;
  /**
   * The account's MQTT session: finds the robot's IP, and is used when the robot can't be reached locally.
   * Share one session between the robots of an account.
   */
  mqtt?: RoborockMqttSession;
  /**
   * The local protocol version to try first (`1.0` or `L01`, see {@link RoborockDeviceApi.localProtocolVersion}).
   * Both are tried anyway: this only saves the wait for the other one (a few seconds).
   */
  localProtocolVersion?: RoborockMessageVersion;
  /** Default 58867 */
  port?: number;
  /** Timeout of each request (default 10s) */
  timeoutMs?: number;
  logger?: MiioLogger;
}

/**
 * The connection of a Roborock-app robot, with the same interface as miIO's `DeviceInfo`: the device classes
 * (`Vacuum`…) work over it unchanged. It talks to the robot locally when possible, else over MQTT.
 *
 * Events: `push` (the data points of the messages the robot sends on its own, e.g. `{ "121": 8 }` when the state
 * changes).
 */
export class RoborockDeviceApi extends EventEmitter implements DeviceApi {
  readonly token = null;
  readonly autoToken = false;
  private local?: RoborockLocalConnection;
  private readonly remote?: RoborockMqttConnection;
  private localFailedAt?: number;
  private resolvedAddress?: string;
  private addressLookupAt?: number;
  private closed = false;
  private readonly debug;

  constructor(private readonly options: RoborockDeviceOptions) {
    super();
    this.debug = createDebug(
      `miio:roborock:${options.duid}`,
      () => options.logger,
    );
    this.resolvedAddress = options.address;
    if (options.mqtt) {
      this.remote = new RoborockMqttConnection(options.mqtt, {
        duid: options.duid,
        localKey: options.localKey,
        timeoutMs: options.timeoutMs,
        logger: options.logger,
      });
      this.remote.on("message", (m) => this.onMessage(m));
    }
  }

  get id() {
    return this.options.duid;
  }

  get model() {
    return this.options.model;
  }

  /** The robot's IP (`undefined` until known) */
  get address() {
    return this.resolvedAddress as string;
  }

  get port() {
    return this.options.port;
  }

  get logger() {
    return this.options.logger;
  }

  /** Reconnects automatically: `false` only after {@link close} */
  get connected() {
    return !this.closed;
  }

  /** The local protocol the robot answered to (store it and pass it as `localProtocolVersion` next time) */
  get localProtocolVersion() {
    return this.local?.protocolVersion ?? this.options.localProtocolVersion;
  }

  /** How the robot is reached right now */
  get transport(): "local" | "mqtt" | undefined {
    if (this.local?.connected) return "local";
    return this.remote ? "mqtt" : undefined;
  }

  private onMessage(message: RoborockMessage) {
    if (rpcResponse(message)) return;
    const dps = dataPoints(message);
    if (dps) this.emit("push", dps);
  }

  /**
   * @returns The local connection, or `undefined` if it can't be used now (no IP, or it failed recently)
   */
  private async localConnection() {
    if (
      this.localFailedAt !== undefined &&
      this.remote &&
      Date.now() - this.localFailedAt < LOCAL_RETRY_MS
    ) {
      return undefined;
    }
    if (
      !this.resolvedAddress &&
      this.remote &&
      (this.addressLookupAt === undefined ||
        Date.now() - this.addressLookupAt >= LOCAL_RETRY_MS)
    ) {
      this.addressLookupAt = Date.now();
      const info = await this.remote
        .call<{ ip?: string }>("get_network_info")
        .catch((err) => {
          this.debug(`Couldn't get the robot's IP: ${err.message}`);
          return undefined;
        });
      if (info?.ip) {
        this.debug(`The robot's IP is ${info.ip}`);
        this.resolvedAddress = info.ip;
      }
    }
    if (!this.resolvedAddress) return undefined;
    if (!this.local) {
      this.local = new RoborockLocalConnection({
        address: this.resolvedAddress,
        localKey: this.options.localKey,
        port: this.options.port,
        timeoutMs: this.options.timeoutMs,
        protocolVersion: this.options.localProtocolVersion,
        logger: this.options.logger,
      });
      this.local.on("message", (m) => this.onMessage(m));
    }
    return this.local;
  }

  /**
   * Connects locally (or checks MQTT when the robot can't be reached locally).
   */
  async connect() {
    const local = await this.localConnection();
    if (local) {
      try {
        await local.connect();
        this.localFailedAt = undefined;
        return;
      } catch (err) {
        if (!this.remote) throw err;
        this.debug(
          `Local connection failed, using MQTT: ${(err as Error).message}`,
        );
        this.localFailedAt = Date.now();
      }
    }
    if (!this.remote) {
      throw new RoborockError(
        "The robot's IP address is needed (or the account's MQTT session)",
      );
    }
    await this.remote.call("get_status");
  }

  private async callOnce(method: string, params: unknown) {
    if (method === "miIO.info" && this.options.firmwareVersion) {
      return {
        model: this.options.model,
        fw_ver: this.options.firmwareVersion,
      };
    }
    const local = await this.localConnection();
    if (local) {
      try {
        const result = await local.call(method, params);
        this.localFailedAt = undefined;
        return result;
      } catch (err) {
        if (err instanceof RoborockApiError || !this.remote) throw err;
        this.debug(`${method} failed locally, using MQTT: ${err}`);
        this.localFailedAt = Date.now();
        local.close();
      }
    }
    if (!this.remote) {
      throw new RoborockError(
        "The robot's IP address is needed (or the account's MQTT session)",
      );
    }
    return this.remote.call(method, params);
  }

  /**
   * @param method The method
   * @param params The params
   * @param options The options
   * @param options.retries Attempts when the robot doesn't answer (default 3)
   * @returns The result
   */
  call = (async (
    method: string,
    params: unknown = [],
    options: { retries?: number } = {},
  ) => {
    const attempts = Math.max(1, options.retries ?? 3);
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.callOnce(method, params);
      } catch (err) {
        if (err instanceof RoborockApiError) {
          throw new MiioError(err.message, String(err.code ?? "error"));
        }
        if (attempt >= attempts || this.closed) {
          throw new MiioError(
            (err as Error).message,
            err instanceof RoborockError ? "timeout" : "error",
          );
        }
        // Not answering: reconnect on the next attempt
        this.local?.close();
      }
    }
  }) as DeviceApi["call"];

  /**
   * Downloads the current map (over MQTT: the robots only send it there).
   *
   * @returns The map file (`rr` format, decompressed)
   */
  async getMapData(): Promise<Buffer> {
    if (!this.remote) {
      throw new RoborockError(
        "The map is only available with the account's MQTT session",
      );
    }
    return this.remote.getMapData();
  }

  /**
   * @returns The current map: rooms (segment IDs, see {@link roomNames} for their names), robot and charger
   * positions, current room…
   */
  async getMap(): Promise<RoborockMap> {
    return parseRoborockMap(await this.getMapData());
  }

  close() {
    this.closed = true;
    this.local?.close();
    this.remote?.close().catch(() => {});
    this.removeAllListeners();
  }
}

/**
 * Connects to a robot paired with the Roborock app: over the local network (local protocols `1.0` and `L01`), and
 * over the account's MQTT connection when the robot can't be reached locally.
 *
 * ```ts
 * const mqtt = new RoborockMqttSession(session.userData.rriot);
 * const [robot] = await new RoborockWebApi(session).getDevices();
 * const vacuum = await roborockDevice({ ...robot, model: robot.model!, mqtt }); // address optional with mqtt
 * ```
 *
 * The status pushes of the robot refresh the device's properties (`stateChanged` events) without waiting for the
 * next poll.
 *
 * @param options The robot's details (from {@link RoborockWebApi.getDevices}), its IP address and/or the MQTT session
 * @returns The device (a `Vacuum` for Roborock vacuums)
 */
export async function roborockDevice(
  options: RoborockDeviceOptions,
): Promise<IDevice> {
  const api = new RoborockDeviceApi(options);
  const handle = { ref: { release: () => api.close() }, api };
  try {
    await api.connect();
  } catch (err) {
    api.close();
    throw err;
  }
  const DeviceClass = models[options.model] ?? Vacuum;
  const instance = new DeviceClass(handle) as IDevice;
  const device = (await instance.init()) ?? instance;
  let refresh: NodeJS.Timeout | undefined;
  api.on("push", () => {
    clearTimeout(refresh);
    refresh = setTimeout(() => {
      Promise.resolve(device.poll()).catch(() => {});
    }, PUSH_REFRESH_DELAY_MS);
    refresh.unref?.();
  });
  return device;
}

/**
 * @param device A device (e.g. from {@link roborockDevice})
 * @returns Its Roborock connection (map, transport, local protocol…), or `undefined` for miIO devices
 */
export function roborockApiOf(device: unknown): RoborockDeviceApi | undefined {
  const api = (device as { handle?: { api?: unknown } } | undefined)?.handle
    ?.api;
  return api instanceof RoborockDeviceApi ? api : undefined;
}
