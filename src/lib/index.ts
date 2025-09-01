import discovery from "./discovery";
import models from "./models";
import { connectToDevice } from "./connect_to_device";
import { infoFromHostname } from "./info_from_hostname";

export {
  /**
   * Get information about the models supported. Can be used to extend the models
   * supported.
   */
  models,
  /**
   * Resolve a device from the given options.
   *
   * Options:
   * `address`, **required** the address to the device as an IP or hostname
   * `port`, optional port number, if not specified the default 54321 will be used
   * `token`, optional token of the device
   */
  connectToDevice as device,
  /**
   * Extract information about a device from its hostname on the local network.
   */
  infoFromHostname,
};

/**
 * Browse for devices available on the network. Will not automatically
 * connect to them.
 *
 * @param options
 */
export function browse(options) {
  return new discovery.Browser(options || {});
}

/**
 * Get access to all devices on the current network. Will find and connect to
 * devices automatically.
 *
 * @param options
 */
export function devices(options) {
  return new discovery.Devices(options || {});
}
