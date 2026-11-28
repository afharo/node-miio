import * as discovery from "./discovery.js";
import { models } from "./models.js";
import { connectToDevice } from "./connect_to_device.js";
import { infoFromHostname } from "./info_from_hostname.js";
import type { BrowserOptions, DevicesOptions } from "./discovery.js";

export { Device as MiioDevice } from "./device.js";
export { MiioError } from "./miio_error.js";
export { configureLogging, type MiioLogger } from "./logger.js";
export type { StateChangedEvent, ErrorChangedEvent } from "./events.js";
export {
  Vacuum,
  MOP_ROUTES,
  type RoborockConsumable,
} from "./devices/vacuums/vacuum.js";
export {
  resolveVacuumModes,
  vacuumModels,
  type CleanPreset,
  type VacuumMode,
  type VacuumModes,
} from "./devices/vacuums/vacuum_modes.js";
export {
  CLEANING_STATES,
  isCleaningState,
  isKnownVacuumState,
  VACUUM_STATES,
  vacuumActivity,
  type VacuumActivity,
  type VacuumState,
} from "./devices/vacuums/vacuum_states.js";
export { MijiaVacuum } from "./devices/vacuums/mijiavacuum.js";
export {
  isVacuum,
  type VacuumDevice,
} from "./devices/vacuums/vacuum_device.js";
export { ViomiVacuum } from "./devices/vacuums/viomivacuum.js";
export { DreameVacuum } from "./devices/vacuums/dreamevacuum.js";
export { MiotVacuum, type MiotMode } from "./devices/vacuums/miot-vacuum.js";
export {
  MiotSpecClient,
  configureMiotSpecs,
  type MiotSpecOptions,
  type ResolvedMiotSpec,
} from "./miot/spec_client.js";
export { MiotSpecIndex, parseUrn, type MiotSpec } from "./miot/miot_spec.js";
export { MiotError } from "./miot/miot_api.js";
export * from "./cloud/index.js";
export * from "./roborock/index.js";
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
} from "./maps/roborock_map.js";
export {
  MapWatcher,
  type MapWatcherDevice,
  type MapWatcherOptions,
  type MapWatcherEvents,
} from "./maps/map_watcher.js";

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
