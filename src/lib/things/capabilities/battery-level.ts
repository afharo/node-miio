import { Capability } from "../capability";
import { percentage } from "../values";

/** Reports its battery level (`batteryLevelChanged`), `-1` until known */
export class BatteryLevel extends Capability {
  static capability = "battery-level";
  static initialState: Record<string, unknown> = { batteryLevel: -1 };

  batteryLevel(): Promise<number> {
    return Promise.resolve(this.getState<number>("batteryLevel"));
  }

  /**
   * Updates the battery level. Emits `batteryLevelChanged`.
   *
   * @param level The level (0-100)
   */
  updateBatteryLevel(level: number | string) {
    const value = percentage(level);
    if (this.updateState("batteryLevel", value)) {
      this.emitEvent("batteryLevelChanged", value);
    }
  }
}
