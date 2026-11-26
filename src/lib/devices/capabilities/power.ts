import { SwitchablePower } from "../../things/capabilities/power";

/** Switchable power, following the `power` property */
export class Power extends SwitchablePower {
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "power" && value !== undefined) {
      this.updatePower(value as boolean);
    }
  }
}
