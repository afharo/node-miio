import { tokens } from "./tokens";
import type { DeviceInfo } from "./device_info";
import { connectToDevice } from "./connect_to_device";
import type { Protocol } from "./protocol";

export interface DeviceHandle {
  ref: { release: () => void };
  api: DeviceInfo;
}

/**
 * Management of a device. Supports querying it for information and changing
 * the Wi-Fi settings.
 */
export class DeviceManagement {
  private readonly api: DeviceInfo;

  constructor(device: { handle: DeviceHandle }) {
    this.api = device.handle.api;
  }

  get model() {
    return this.api.model;
  }

  get token() {
    const token = this.api.token;
    return token ? token.toString("hex") : null;
  }

  get autoToken() {
    return this.api.autoToken;
  }

  get address() {
    return this.api.address;
  }

  get port() {
    return this.api.port;
  }

  /**
   * Get information about this device. Includes model info, token and
   * connection information.
   */
  info() {
    return this.api.call("miIO.info");
  }

  /**
   * Update the wireless settings of this device. Needs `ssid` and `passwd`
   * to be set in the options object.
   *
   * `uid` can be set to associate the device with a Mi Home user id.
   *
   * @param options
   * @param options.ssid
   * @param options.password
   * @param options.passwd
   */
  async updateWireless(options: { ssid?: string; passwd?: string }) {
    if (typeof options.ssid !== "string") {
      throw new Error("options.ssid must be a string");
    }
    if (typeof options.passwd !== "string") {
      throw new Error("options.passwd must be a string");
    }

    const result = await this.api.call(
      "miIO.config_router",
      options as Protocol["miIO.config_router"],
    );
    if (result !== 0 && result !== "OK" && result !== "ok") {
      throw new Error("Failed updating wireless");
    }
    return true;
  }

  /**
   * Get the wireless state of this device. Includes if the device is
   * online and counters for things such as authentication failures and
   * connection success and failures.
   */
  wirelessState() {
    return this.api.call("miIO.wifi_assoc_state");
  }

  /**
   * Update the token used to connect to this device.
   *
   * @param {string|Buffer} token
   */
  async updateToken(token: string | Buffer) {
    if (token instanceof Buffer) {
      token = token.toString("hex");
    } else if (typeof token !== "string") {
      return Promise.reject(
        new Error("Token must be a hex-string or a Buffer"),
      );
    }

    try {
      const device = await connectToDevice({
        address: this.address,
        port: this.port,
        token: token,
      });
      // Connection to device could be performed
      await tokens.update(`${this.api.id}`, Buffer.from(token, "hex"));
      device.destroy();
      return true;
    } catch (_err) {
      // Connection to device failed with the token
      return false;
    }
  }
}
