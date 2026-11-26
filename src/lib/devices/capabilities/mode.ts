import { SwitchableMode } from "../../things/capabilities/common";

/** Switchable mode, following the `mode` property */
export class Mode extends SwitchableMode {
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "mode") {
      this.updateMode(value as string);
    }
  }
}
