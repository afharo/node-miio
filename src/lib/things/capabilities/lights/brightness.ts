import { Capability } from "../../capability";
import {
  boolean,
  duration,
  percentage,
  percentageChange,
  type Duration,
} from "../../values";

import { DEFAULT_LIGHT_DURATION, type BrightnessChangeOptions } from "./light";

/** Reports its brightness (`brightnessChanged`) */
export class Brightness extends Capability {
  static capability = "brightness";

  brightness(..._args: unknown[]): number | Promise<number> {
    return this.getState<number>("brightness", 0);
  }

  /**
   * Updates the brightness. Emits `brightnessChanged`.
   *
   * @param brightness The brightness (0-100)
   */
  updateBrightness(brightness: number | string) {
    const value = percentage(brightness, { min: 0, max: 100, precision: 1 });
    if (this.updateState("brightness", value)) {
      this.emitEvent("brightnessChanged", value);
    }
  }
}

/** The brightness can be changed. Implement `changeBrightness(brightness, options)`. */
export class Dimmable extends Brightness {
  static capability = "dimmable";

  /**
   * Gets the brightness, or changes it: `50` (set), `"+10"` (increase) or `"-10"` (decrease).
   *
   * @param brightness The brightness to set
   * @param transition The transition
   * @returns The brightness
   */
  async brightness(
    brightness?: number | string,
    transition: number | string | Duration = DEFAULT_LIGHT_DURATION,
  ): Promise<number> {
    const current = this.getState<number>("brightness", 0);
    if (brightness === undefined) return current;

    const change = percentageChange(brightness);
    if (change.isIncrease) {
      return this.setBrightness(current + change.value, transition, true);
    }
    if (change.isDecrease) {
      return this.setBrightness(current - change.value, transition, false);
    }
    return this.setBrightness(change.value, transition, true);
  }

  increaseBrightness(
    amount: number,
    transition: number | string | Duration = DEFAULT_LIGHT_DURATION,
  ) {
    const current = this.getState<number>("brightness", 0);
    return this.setBrightness(
      Math.min(100, current + amount),
      transition,
      true,
    );
  }

  decreaseBrightness(
    amount: number,
    transition: number | string | Duration = DEFAULT_LIGHT_DURATION,
  ) {
    const current = this.getState<number>("brightness", 0);
    return this.setBrightness(Math.max(0, current - amount), transition, false);
  }

  /**
   * Changes the brightness.
   *
   * @param brightness The brightness (0-100)
   * @param transition The transition
   * @param powerOn Whether to switch the light on
   * @returns The new brightness
   */
  async setBrightness(
    brightness: number | string,
    transition: number | string | Duration = DEFAULT_LIGHT_DURATION,
    powerOn: boolean | string = true,
  ): Promise<number> {
    if (brightness === undefined) {
      throw new Error("Brightness must be specified");
    }
    const value = percentage(brightness, { min: 0, max: 100 });
    await this.changeBrightness(value, {
      duration: duration(transition),
      powerOn: value <= 0 ? false : boolean(powerOn),
    });
    return this.getState<number>("brightness", 0);
  }

  /**
   * Changes the brightness of the device. Implemented by the devices.
   *
   * @param _brightness The brightness (0-100)
   * @param _options The transition and whether to switch it on
   */
  changeBrightness(
    _brightness: number,
    _options: BrightnessChangeOptions,
  ): Promise<unknown> {
    throw new Error("changeBrightness not implemented");
  }
}
