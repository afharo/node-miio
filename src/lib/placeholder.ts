import { MiioApi } from "./device.js";
import type { DeviceHandle } from "./management.js";

export class Placeholder extends MiioApi {
  static get type() {
    return "placeholder";
  }

  constructor(public readonly handle: DeviceHandle) {
    super(handle);
  }
}
