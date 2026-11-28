import { Capability } from "../capability.js";
import { percentage } from "../values.js";
import type { ActionDefinition } from "../action_metadata.js";

/** Reports its fan speed (`fanSpeedChanged`) */
export class FanSpeed extends Capability {
  static capability = "fan-speed";
  static actions: ActionDefinition[] = [
    { name: "fanSpeed", description: "The fan speed", returns: "number" },
  ];

  fanSpeed(): Promise<number | null> {
    return Promise.resolve(this.getState<number | null>("fanSpeed"));
  }

  /**
   * Updates the fan speed. Emits `fanSpeedChanged`.
   *
   * @param fanSpeed The fan speed
   */
  updateFanSpeed(fanSpeed: number | string) {
    const value = percentage(fanSpeed);
    if (this.updateState("fanSpeed", value)) {
      this.emitEvent("fanSpeedChanged", value);
    }
  }
}

/** The fan speed can be changed. Implement `changeFanSpeed(speed)`. */
export class AdjustableFanSpeed extends FanSpeed {
  static capability = "adjustable-fan-speed";
  static actions: ActionDefinition[] = [
    {
      name: "fanSpeed",
      description: "Gets the fan speed, or sets it",
      arguments: [
        { type: "number", optional: true, description: "The fan speed to set" },
      ],
      returns: "number",
    },
    {
      name: "setFanSpeed",
      description: "Changes the fan speed",
      arguments: [{ type: "number", description: "The fan speed" }],
      returns: "number",
    },
  ];

  /**
   * Gets the fan speed, or sets it.
   *
   * @param speed The fan speed to set
   * @returns The fan speed
   */
  fanSpeed(speed?: number | string): Promise<number | null> {
    if (speed === undefined) return super.fanSpeed();
    return this.setFanSpeed(speed);
  }

  /**
   * Changes the fan speed.
   *
   * @param speed The fan speed
   * @returns The new fan speed
   */
  async setFanSpeed(speed: number | string): Promise<number | null> {
    await this.changeFanSpeed(percentage(speed));
    return this.getState<number | null>("fanSpeed");
  }

  /**
   * Changes the fan speed of the device. Implemented by the devices.
   *
   * @param _speed The fan speed
   */
  changeFanSpeed(_speed: number): Promise<unknown> {
    throw new Error("changeFanSpeed not implemented");
  }
}
