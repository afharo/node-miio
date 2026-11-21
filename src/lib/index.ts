import * as discovery from "./discovery";
import { models } from "./models";
import { connectToDevice } from "./connect_to_device";
import { infoFromHostname } from "./info_from_hostname";
import type { BrowserOptions, DevicesOptions } from "./discovery";

export { Device as MiioDevice } from "./device";
export { MiioError } from "./miio_error";
export { configureLogging, type MiioLogger } from "./logger";
export type { StateChangedEvent, ErrorChangedEvent } from "./events";
export {
  Vacuum,
  MOP_ROUTES,
  type RoborockConsumable,
} from "./devices/vacuums/vacuum";
export {
  resolveVacuumModes,
  type VacuumMode,
  type VacuumModes,
} from "./devices/vacuums/vacuum_modes";
export { MijiaVacuum } from "./devices/vacuums/mijiavacuum";
export { isVacuum, type VacuumDevice } from "./devices/vacuums/vacuum_device";
export { ViomiVacuum } from "./devices/vacuums/viomivacuum";
export { DreameVacuum } from "./devices/vacuums/dreamevacuum";
export { MiotVacuum, type MiotMode } from "./devices/vacuums/miot-vacuum";
export {
  MiotSpecClient,
  configureMiotSpecs,
  type MiotSpecOptions,
  type ResolvedMiotSpec,
} from "./miot/spec_client";
export { MiotSpecIndex, parseUrn, type MiotSpec } from "./miot/miot_spec";
export { MiotError } from "./miot/miot_api";
export * from "./cloud/index";
export * from "./roborock/index";
export {
  parseRoborockMap,
  roomAt,
  roomOfPixel,
  MapParseError,
  MM_PER_PIXEL,
  PIXEL,
  type RoborockMap,
  type MapRoom,
  type MapPoint,
  type MapRectangle,
  type MapArea,
  type MapImage,
} from "./maps/roborock_map";
export {
  MapWatcher,
  type MapWatcherDevice,
  type MapWatcherOptions,
  type MapWatcherEvents,
} from "./maps/map_watcher";

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
export function browse(options?: BrowserOptions) {
  return new discovery.Browser(options || {});
}

/**
 * Get access to all devices on the current network. Will find and connect to
 * devices automatically.
 *
 * @param options
 */
export function devices(options?: DevicesOptions) {
  return new discovery.Devices(options || {});
}
