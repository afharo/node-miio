import { MiioApi } from "../device";
import { compose } from "../things/compose";
import { Nameable } from "../things/capabilities/nameable";
import {
  Light,
  type BrightnessChangeOptions,
} from "../things/capabilities/lights/light";
import { Fading } from "../things/capabilities/lights/fading";
import type { Duration } from "../things/values";

import { Power } from "./capabilities/power";
import { Dimmable } from "./capabilities/dimmable";

const DEFAULT_EFFECT = "smooth";
const DEFAULT_DURATION = 500;

/** The colour temperatures supported by the Yeelights, in kelvins */
export const TEMPERATURE_RANGE = { min: 2700, max: 6500 };

export class Yeelight extends compose(
  MiioApi,
  Light,
  Fading,
  Power,
  Dimmable,
  Nameable,
) {
  static get type() {
    return "miio:yeelight";
  }

  constructor(handle: ConstructorParameters<typeof MiioApi>[0]) {
    super(handle);

    this.defineProperty("power", {
      name: "power",
      mapper: (v: string) => v === "on",
    });

    this.defineProperty("bright", {
      name: "brightness",
      mapper: (v: string) => parseInt(v, 10),
    });

    // Used for scheduling turning off after a while
    this.defineProperty("delayoff", {
      name: "offDelay",
      mapper: (v: string) => parseInt(v, 10),
    });

    // Query for the color mode
    this.defineProperty("color_mode", {
      name: "colorMode",
      mapper: (v: string) => {
        switch (parseInt(v, 10)) {
          case 1:
            return "rgb";
          case 2:
            return "colorTemperature";
          case 3:
            return "hsv";
        }
      },
    });

    // Read the name of the light
    this.defineProperty("name");

    /*
     * Set maximum fade time to 30s - seems to work well, longer values
     * sometimes cause jumps on certain models.
     */
    this.updateMaxChangeTime("30s");
  }

  propertyUpdated(key: string, value: unknown, oldValue?: unknown) {
    if (key === "name") {
      this.metadata.name = value as string;
    }

    super.propertyUpdated(key, value, oldValue);
  }

  changePower(power: boolean) {
    // TODO: Support for duration
    return this.call("set_power", Yeelight.withEffect(power ? "on" : "off"), {
      refresh: ["power"],
    }).then(MiioApi.checkOk);
  }

  /**
   * Make the current state the default state, meaning the light will restore
   * to this state after power has been cut.
   */
  setDefault() {
    return this.call("set_default", []).then(MiioApi.checkOk);
  }

  changeBrightness(brightness: number, options: BrightnessChangeOptions) {
    if (brightness <= 0) {
      return this.changePower(false);
    } else {
      let promise;
      if (options.powerOn && this.getState("power") === false) {
        // Currently not turned on
        promise = this.changePower(true);
      } else {
        promise = Promise.resolve();
      }

      return promise
        .then(() =>
          this.call(
            "set_bright",
            Yeelight.withEffect(brightness, options.duration),
            {
              refresh: ["brightness"],
            },
          ),
        )
        .then(MiioApi.checkOk);
    }
  }

  changeName(name: string) {
    return this.call("set_name", [name])
      .then(MiioApi.checkOk)
      .then(() => (this.metadata.name = name));
  }

  /**
   * Helper method to combine an argument with effect information.
   *
   * @param arg The argument(s) of the command
   * @param duration The duration of the effect in ms
   */
  static withEffect(arg: unknown, duration?: Duration): unknown[] {
    const result = Array.isArray(arg) ? arg : [arg];

    if (duration) {
      if (duration.ms > 0) {
        result.push(DEFAULT_EFFECT);
        result.push(duration.ms);
      } else {
        result.push("sudden");
        result.push(0);
      }
    } else {
      result.push(DEFAULT_EFFECT);
      result.push(DEFAULT_DURATION);
    }

    return result;
  }
}

/**
 * Clamps a colour temperature to the range of the Yeelights.
 *
 * @param kelvins The temperature
 * @returns The clamped temperature
 */
export const clampTemperature = (kelvins: number) =>
  Math.min(Math.max(kelvins, TEMPERATURE_RANGE.min), TEMPERATURE_RANGE.max);
