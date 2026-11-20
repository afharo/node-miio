import type { DeviceApi } from "../device_info";
import type { IDevice } from "../device";
import { Vacuum } from "../devices/vacuums/vacuum";
import type { MiioLogger } from "../logger";
import { MiioError } from "../miio_error";
import { models } from "../models";

import { RoborockApiError, RoborockError } from "./errors";
import { RoborockLocalConnection } from "./local_connection";

export interface RoborockDeviceOptions {
  /** The robot's ID (`duid`, from the account's home data) */
  duid: string;
  /** The robot's local key (from the account's home data) */
  localKey: string;
  /** The model (from the account's home data), e.g. `roborock.vacuum.a296` */
  model: string;
  /** The robot's IP address */
  address: string;
  /** Default 58867 */
  port?: number;
  /** Timeout of each request (default 10s) */
  timeoutMs?: number;
  logger?: MiioLogger;
}

/**
 * The connection of a Roborock-app robot, with the same interface as miIO's `DeviceInfo`: the device classes
 * (`Vacuum`…) work over it unchanged.
 */
export class RoborockDeviceApi implements DeviceApi {
  readonly token = null;
  readonly autoToken = false;
  readonly connection: RoborockLocalConnection;

  constructor(private readonly options: RoborockDeviceOptions) {
    this.connection = new RoborockLocalConnection(options);
  }

  get id() {
    return this.options.duid;
  }

  get model() {
    return this.options.model;
  }

  get address() {
    return this.options.address;
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

  private closed = false;

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
        return await this.connection.call(method, params);
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
        this.connection.close();
      }
    }
  }) as DeviceApi["call"];

  close() {
    this.closed = true;
    this.connection.close();
  }
}

/**
 * Connects to a robot paired with the Roborock app, over the local network (protocol `1.0` only, for now).
 *
 * ```ts
 * const [robot] = await new RoborockWebApi(session).getDevices();
 * const vacuum = await roborockDevice({ ...robot, model: robot.model!, address: "192.168.1.20" });
 * ```
 *
 * @param options The robot's details (from {@link RoborockWebApi.getDevices}) and its IP address
 * @returns The device (a `Vacuum` for Roborock vacuums)
 */
export async function roborockDevice(
  options: RoborockDeviceOptions,
): Promise<IDevice> {
  const api = new RoborockDeviceApi(options);
  const handle = { ref: { release: () => api.close() }, api };
  try {
    await api.connection.connect();
  } catch (err) {
    api.close();
    throw err;
  }
  const DeviceClass = models[options.model] ?? Vacuum;
  const device = new DeviceClass(handle) as IDevice;
  return (await device.init()) ?? device;
}
