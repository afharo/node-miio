import {
  matchDevice,
  type CloudDevice,
  type CloudDeviceMatch,
  type CloudServer,
  type XiaomiCloud,
} from "./client.js";

/**
 * The devices of the Xiaomi account, listed once and shared (e.g. by all the devices of a Homebridge or Matterbridge
 * platform): listing them takes a few requests per server.
 *
 * ```ts
 * const devices = new CloudDeviceCache(cloud);
 * const vacuum = await devices.find({ ip: "192.168.1.20" });
 * // vacuum?.token, vacuum?.server
 * ```
 */
export class CloudDeviceCache {
  private devices?: Promise<CloudDevice[]>;

  /**
   * @param cloud A logged-in Xiaomi Cloud client
   * @param options The options
   * @param options.servers The servers to check (all of them by default)
   */
  constructor(
    private readonly cloud: Pick<XiaomiCloud, "getDevices">,
    private readonly options: { servers?: readonly CloudServer[] } = {},
  ) {}

  /**
   * @returns The devices of the account. A failure is not cached: the next call tries again.
   */
  list(): Promise<CloudDevice[]> {
    this.devices ??= this.cloud.getDevices(this.options).catch((err) => {
      this.devices = undefined;
      throw err;
    });
    return this.devices;
  }

  /**
   * Finds a device of the account. If it's not found in the cached list, the list is downloaded again once (e.g. a
   * device added since).
   *
   * @param match The device ID, token or local IP of the device (the first one given that matches)
   * @returns The device, if found
   */
  async find(match: CloudDeviceMatch): Promise<CloudDevice | undefined> {
    const cached = this.devices !== undefined;
    const device = matchDevice(await this.list(), match);
    if (device || !cached) return device;
    this.devices = undefined;
    return matchDevice(await this.list(), match);
  }

  /** Forgets the devices (the next call downloads them again) */
  clear() {
    this.devices = undefined;
  }
}
