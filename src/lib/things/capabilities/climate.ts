import { Capability } from "../capability";
import { boolean, percentage, type CodeInput } from "../values";

import { ErrorState } from "./common";

/**
 * Reports whether it's cleaning: `cleaningChanged`, `cleaningStarted`, and `cleaningStopped` with `cleaningDone` (or
 * `cleaningError`, if it stopped because of an error).
 */
export class CleaningState extends ErrorState {
  static capability = "cleaning-state";
  static initialState: Record<string, unknown> = { cleaning: false };

  cleaning(): Promise<boolean> {
    return Promise.resolve(this.getState<boolean>("cleaning"));
  }

  /**
   * Updates the cleaning state.
   *
   * @param cleaning Whether it's cleaning
   */
  updateCleaning(cleaning: boolean | string | number) {
    const value = boolean(cleaning);
    if (this.updateState("cleaning", value)) {
      this.emitEvent("cleaningChanged", value);
      if (value) {
        this.emitEvent("cleaningStarted");
      } else {
        const error = this.getState("error");
        if (error) {
          this.emitEvent("cleaningError", error);
        } else {
          this.emitEvent("cleaningDone");
        }
        this.emitEvent("cleaningStopped");
      }
    }
  }

  /**
   * Sets (or clears) the error, and marks it as not cleaning.
   *
   * @param error The error
   */
  updateError(error: CodeInput | null | undefined) {
    super.updateError(error);
    this.updateCleaning(false);
  }
}

/** Can clean by itself. Implement `activateCleaning()` and `deactivateCleaning()`. */
export class AutonomousCleaning extends CleaningState {
  static capability = "autonomous-cleaning";

  async clean(): Promise<null> {
    await this.activateCleaning();
    return null;
  }

  async stop(): Promise<null> {
    await this.deactivateCleaning();
    return null;
  }

  /** Starts cleaning. Implemented by the devices. */
  activateCleaning(): Promise<unknown> | unknown {
    throw new Error("activateCleaning not implemented");
  }

  /** Stops cleaning. Implemented by the devices. */
  deactivateCleaning(): Promise<unknown> | unknown {
    throw new Error("deactivateCleaning not implemented");
  }
}

/** Can clean a spot. Implement `activateSpotClean()`. */
export class SpotCleaning extends CleaningState {
  static capability = "spot-cleaning";

  async spotClean(): Promise<null> {
    await this.activateSpotClean();
    return null;
  }

  /** Starts cleaning a spot. Implemented by the devices. */
  activateSpotClean(): Promise<unknown> | unknown {
    throw new Error("activateSpotClean not implemented");
  }
}

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
