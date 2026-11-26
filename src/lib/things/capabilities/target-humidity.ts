import { Capability } from "../capability";
import { percentage } from "../values";

/** Reports its target humidity (`targetHumidityChanged`) */
export class TargetHumidity extends Capability {
  static capability = "target-humidity";

  targetHumidity(): Promise<number | null> {
    return Promise.resolve(this.getState<number | null>("targetHumidity"));
  }

  /**
   * Updates the target humidity. Emits `targetHumidityChanged`.
   *
   * @param target The target humidity
   */
  updateTargetHumidity(target: number | string) {
    const value = percentage(target);
    if (this.updateState("targetHumidity", value)) {
      this.emitEvent("targetHumidityChanged", value);
    }
  }
}

/** The target humidity can be changed. Implement `changeTargetHumidity(humidity)`. */
export class AdjustableTargetHumidity extends TargetHumidity {
  static capability = "adjustable-target-humidity";

  /**
   * Gets the target humidity, or sets it.
   *
   * @param humidity The target humidity to set
   * @returns The target humidity
   */
  targetHumidity(humidity?: number | string): Promise<number | null> {
    if (humidity === undefined) return super.targetHumidity();
    return this.setTargetHumidity(humidity);
  }

  /**
   * Changes the target humidity.
   *
   * @param humidity The target humidity
   * @returns The new target humidity
   */
  async setTargetHumidity(humidity: number | string) {
    await this.changeTargetHumidity(percentage(humidity));
    return this.getState<number | null>("targetHumidity");
  }

  /**
   * Changes the target humidity of the device. Implemented by the devices.
   *
   * @param _humidity The target humidity
   */
  changeTargetHumidity(_humidity: number): Promise<unknown> | unknown {
    throw new Error("changeTargetHumidity not implemented");
  }
}
