import { BatteryLevel as BaseBatteryLevel } from "../../things/capabilities/common";

/** Battery level, following the `batteryLevel` property */
export class BatteryLevel extends BaseBatteryLevel {
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "batteryLevel") {
      this.updateBatteryLevel(value as number);
    }
  }
}
