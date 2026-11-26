import { Capability } from "../capability";
import { percentage } from "../values";

/** Reports its fan speed (`fanSpeedChanged`) */
export class FanSpeed extends Capability {
  static capability = "fan-speed";

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
  changeFanSpeed(_speed: number): Promise<unknown> | unknown {
    throw new Error("changeFanSpeed not implemented");
  }
}
