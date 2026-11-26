import { isDeepStrictEqual } from "node:util";

import { Capability } from "../../capability";
import { number } from "../../values";

const TEMPERATURE_RANGE = Symbol("colorTemperatureRange");

type WithRange = {
  [TEMPERATURE_RANGE]?: { min: number; max: number };
};

/** Supports colour temperatures, in a range (`colorTemperatureRangeChanged`) */
export class ColorTemperature extends Capability {
  static capability = "color:temperature";

  /** The supported range, in kelvins */
  async colorTemperatureRange(): Promise<{ min: number; max: number }> {
    const range = (this as WithRange)[TEMPERATURE_RANGE];
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
    const self = this as WithRange;
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
