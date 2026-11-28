import { Capability } from "../capability.js";
import { percentage } from "../values.js";
import type { ActionDefinition } from "../action_metadata.js";

/** Reports its target humidity (`targetHumidityChanged`) */
export class TargetHumidity extends Capability {
  static capability = "target-humidity";
  static actions: ActionDefinition[] = [
    {
      name: "targetHumidity",
      description: "The target humidity",
      returns: "percentage",
    },
  ];

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
  static actions: ActionDefinition[] = [
    {
      name: "targetHumidity",
      description: "Gets the target humidity, or sets it",
      arguments: [
        {
          type: "percentage",
          optional: true,
          description: "The target humidity to set",
        },
      ],
      returns: "percentage",
    },
    {
      name: "setTargetHumidity",
      description: "Changes the target humidity",
      arguments: [{ type: "percentage", description: "The target humidity" }],
      returns: "percentage",
    },
  ];

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
  changeTargetHumidity(_humidity: number): Promise<unknown> {
    throw new Error("changeTargetHumidity not implemented");
  }
}
