import { MiioApi } from "../device.js";
import { compose } from "../things/compose.js";
import type { ActionDefinition } from "../things/action_metadata.js";

import { Power } from "./capabilities/power.js";
import { Mode } from "./capabilities/mode.js";
import { SwitchableLED } from "./capabilities/switchable-led.js";
import { LEDBrightness } from "./capabilities/changeable-led-brightness.js";
import { Buzzer } from "./capabilities/buzzer.js";
import { Temperature, Humidity, AQI } from "./capabilities/sensor.js";

/**
 * Abstraction over a Mi Air Purifier.
 *
 * Air Purifiers have a mode that indicates if is on or not. Changing the mode
 * to `idle` will power off the device, all other modes will power on the
 * device.
 */
export class AirPurifier extends compose(
  MiioApi,
  Power,
  Mode,
  Temperature,
  Humidity,
  AQI,
  SwitchableLED,
  LEDBrightness,
  Buzzer,
) {
  static actions: ActionDefinition[] = [
    {
      name: "favoriteLevel",
      description: "Gets the level of the favorite mode (0-16), or sets it",
      arguments: [
        { type: "number", optional: true, description: "The level to set" },
      ],
      returns: "number",
    },
    {
      name: "setFavoriteLevel",
      description: "Changes the level of the favorite mode",
      arguments: [{ type: "number", description: "The level (0-16)" }],
      returns: "number",
    },
  ];

  static get types() {
    return ["air-purifier"];
  }

  static get type() {
    return "miio:air-purifier";
  }

  constructor(options) {
    super(options);

    // Define the power property
    this.defineProperty("power", (v) => v === "on");

    // Set the mode property and supported modes
    this.defineProperty("mode");
    this.updateModes(["idle", "auto", "silent", "favorite"]);

    // Sensor value for Temperature capability
    this.defineProperty("temp_dec", {
      name: "temperature",
      mapper: (v: number) => v / 10.0,
    });

    // Sensor value for RelativeHumidity capability
    this.defineProperty("humidity");

    // Sensor value used for AQI (PM2.5) capability
    this.defineProperty("aqi");

    // The favorite level
    this.defineProperty("favorite_level", {
      name: "favoriteLevel",
    });

    // Info about usage
    this.defineProperty("filter1_life", {
      name: "filterLifeRemaining",
    });
    this.defineProperty("f1_hour_used", {
      name: "filterHoursUsed",
    });
    this.defineProperty("use_time", {
      name: "useTime",
    });

    // State for SwitchableLED capability
    this.defineProperty("led", {
      name: "led",
      mapper: (v: string) => v === "on",
    });

    this.defineProperty("led_b", {
      name: "ledBrightness",
      mapper: (v) => {
        switch (v) {
          case 0:
            return "bright";
          case 1:
            return "dim";
          case 2:
            return "off";
          default:
            return "unknown";
        }
      },
    });

    // Buzzer and beeping
    this.defineProperty("buzzer", {
      name: "buzzer",
      mapper: (v: string) => v === "on",
    });
  }

  changePower(power) {
    return this.call("set_power", [power ? "on" : "off"], {
      refresh: ["power", "mode"],
      refreshDelay: 200,
    });
  }

  /**
   * Perform a mode change as requested by `mode(string)` or
   * `setMode(string)`.
   *
   * @param mode
   */
  changeMode(mode) {
    return this.call("set_mode", [mode], {
      refresh: ["power", "mode"],
      refreshDelay: 200,
    })
      .then(MiioApi.checkOk)
      .catch((err) => {
        throw err.code === -5001
          ? new Error("Mode `" + mode + "` not supported")
          : err;
      });
  }

  /**
   * Get the favorite level used when the mode is `favorite`. Between 0 and 16.
   *
   * @param level
   */
  favoriteLevel(level?: number) {
    if (typeof level === "undefined") {
      return Promise.resolve(this.property("favoriteLevel"));
    }

    return this.setFavoriteLevel(level);
  }

  /**
   * Set the favorite level used when the mode is `favorite`, should be
   * between 0 and 16.
   *
   * @param level
   */
  setFavoriteLevel(level: number) {
    return this.call("set_level_favorite", [level]).then(() => null);
  }

  /**
   * Set the LED brightness to either `bright`, `dim` or `off`.
   *
   * @param level
   */
  changeLEDBrightness(level) {
    switch (level) {
      case "bright":
        level = 0;
        break;
      case "dim":
        level = 1;
        break;
      case "off":
        level = 2;
        break;
      default:
        return Promise.reject(new Error("Invalid LED brigthness: " + level));
    }
    return this.call("set_led_b", [level], { refresh: ["ledBrightness"] }).then(
      () => null,
    );
  }
}
