import { Capability } from "../../things/capability.js";
import type { Device } from "../../device.js";

/**
 * Base of the capabilities that talk to the device (`this.call(…)`, `this.property(…)`…). It's a {@link Capability},
 * typed as a miIO device.
 */
export const DeviceCapability =
  Capability as unknown as abstract new () => Device;
export type DeviceCapability = Device;
