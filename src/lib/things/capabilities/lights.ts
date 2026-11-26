import { isDeepStrictEqual } from "node:util";

import { Capability } from "../capability";
import { color, type Color, type ColorInput } from "../color";
import {
  boolean,
  duration,
  number,
  percentage,
  percentageChange,
  type Duration,
} from "../values";

/** The default transition of the light changes */
export const DEFAULT_LIGHT_DURATION = duration(400);

/** Options of a light change */
export interface LightChangeOptions {
  duration: Duration;
}

/** Options of a brightness change */
export interface BrightnessChangeOptions extends LightChangeOptions {
  /** Whether to switch the light on (`false` when dimming down or to 0) */
  powerOn: boolean;
}

/** A light */
export class Light extends Capability {
  static type = "light";
}

/** A light bulb */
export class LightBulb extends Light {
  static type = "light-bulb";
}

/** A light strip */
export class LightStrip extends Light {
  static type = "light-strip";
}

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
  ): Promise<unknown> | unknown {
    throw new Error("changeBrightness not implemented");
  }
}

/** The colour can be changed. Implement `changeColor(color, options)`. */
export class Colorable extends Capability {
  static capability = "colorable";

  /**
   * Gets the colour, or changes it.
   *
   * @param value The colour to set
   * @param transition The transition
   * @returns The colour
   */
  color(
    value?: ColorInput,
    transition: number | string | Duration = DEFAULT_LIGHT_DURATION,
  ): Promise<Color | null> {
    if (value) return this.setColor(value, transition);
    return Promise.resolve(this.getState<Color | null>("color"));
  }

  /**
   * Changes the colour.
   *
   * @param value The colour
   * @param transition The transition
   * @returns The new colour
   */
  async setColor(
    value: ColorInput,
    transition: number | string | Duration = DEFAULT_LIGHT_DURATION,
  ): Promise<Color | null> {
    if (value === undefined) throw new Error("Color must be specified");
    await this.changeColor(color(value), { duration: duration(transition) });
    return this.getState<Color | null>("color");
  }

  /**
   * Updates the colour. Emits `colorChanged`.
   *
   * @param value The colour
   */
  updateColor(value: Color) {
    if (this.updateState("color", value)) {
      this.emitEvent("colorChanged", value);
    }
  }

  /**
   * Changes the colour of the device. Implemented by the devices.
   *
   * @param _color The colour
   * @param _options The transition
   */
  changeColor(
    _color: Color,
    _options: LightChangeOptions,
  ): Promise<unknown> | unknown {
    throw new Error("changeColor not implemented");
  }
}

const TEMPERATURE_RANGE = Symbol("colorTemperatureRange");
const MAX_CHANGE_TIME = Symbol("maxChangeTime");

type WithLightData = {
  [TEMPERATURE_RANGE]?: { min: number; max: number };
  [MAX_CHANGE_TIME]?: Duration;
};

/** Supports colour temperatures, in a range (`colorTemperatureRangeChanged`) */
export class ColorTemperature extends Capability {
  static capability = "color:temperature";

  /** The supported range, in kelvins */
  async colorTemperatureRange(): Promise<{ min: number; max: number }> {
    const range = (this as WithLightData)[TEMPERATURE_RANGE];
    if (!range) throw new Error("Temperature range has not been set");
    return { ...range };
  }

  /**
   * Updates the supported range. Emits `colorTemperatureRangeChanged`.
   *
   * @param min The minimum, in kelvins
   * @param max The maximum, in kelvins
   */
  updateColorTemperatureRange(min: number | string, max: number | string) {
    let low = number(min);
    let high = number(max);
    if (low > high) [low, high] = [high, low];
    const range = { min: low, max: high };
    const self = this as WithLightData;
    if (!isDeepStrictEqual(self[TEMPERATURE_RANGE], range)) {
      self[TEMPERATURE_RANGE] = range;
      this.emitEvent("colorTemperatureRangeChanged", range);
    }
  }
}

/** Supports full (RGB) colours */
export class ColorFull extends Capability {
  static capability = "color:full";
}

/** Can fade between changes, up to a maximum time */
export class Fading extends Capability {
  static capability = "fading";

  maxChangeTime(): Promise<Duration | undefined> {
    return Promise.resolve((this as WithLightData)[MAX_CHANGE_TIME]);
  }

  /**
   * Updates the maximum time of a change.
   *
   * @param time The time (e.g. `"30s"`)
   */
  updateMaxChangeTime(time: number | string | Duration) {
    (this as WithLightData)[MAX_CHANGE_TIME] = duration(time);
  }
}
