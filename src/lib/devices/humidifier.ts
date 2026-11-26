import { MiioApi } from "../device";
import { compose } from "../things/compose";
import { SwitchableMode } from "../things/capabilities/mode";
import { AdjustableTargetHumidity } from "../things/capabilities/target-humidity";

import { Power } from "./capabilities/power";
import { Buzzer } from "./capabilities/buzzer";
import { LEDBrightness } from "./capabilities/changeable-led-brightness";
import { Temperature, Humidity } from "./capabilities/sensor";

const LED_BRIGHTNESS: Record<string, number> = { bright: 0, dim: 1, off: 2 };

/**
 * Abstraction over a Mi Humidifier.
 *
 */
export class Humidifier extends compose(
  MiioApi,
  Power,
  SwitchableMode,
  AdjustableTargetHumidity,
  Temperature,
  Humidity,
  Buzzer,
  LEDBrightness,
) {
  static get types() {
    return ["humidifier"];
  }

  static get type() {
    return "miio:humidifier";
  }

  constructor(handle: ConstructorParameters<typeof MiioApi>[0]) {
    super(handle);

    this.defineProperty("power", (v: string) => v === "on");

    // Set the mode property and supported modes
    this.defineProperty("mode");
    this.updateModes(["idle", "silent", "medium", "high"]);

    // Humidity limit
    this.defineProperty("limit_hum", {
      name: "targetHumidity",
    });

    // Sensor values reported by the device
    this.defineProperty("temp_dec", {
      name: "temperature",
      mapper: (v: number) => v / 10.0,
    });

    this.defineProperty("humidity");

    // Buzzer and beeping
    this.defineProperty("buzzer", {
      name: "buzzer",
      mapper: (v: string) => v === "on",
    });

    this.defineProperty("led_b", {
      name: "ledBrightness",
      mapper: (v: number) => {
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
  }

  propertyUpdated(key: string, value: unknown, oldValue?: unknown) {
    /*
     * Emulate that the humidifier has an idle mode.
     */
    if (key === "power") {
      if (value) {
        this.updateMode(this.property<string>("mode"));
      } else {
        this.updateMode("idle");
      }
    } else if (key === "mode") {
      const power = this.property("power");
      if (power) {
        this.updateMode(value as string);
      } else {
        this.updateMode("idle");
      }
    } else if (key === "targetHumidity") {
      this.updateTargetHumidity(value as number);
    }

    super.propertyUpdated(key, value, oldValue);
  }

  changePower(power: boolean) {
    return this.call("set_power", [power ? "on" : "off"], {
      refresh: ["power", "mode"],
      refreshDelay: 200,
    });
  }

  /**
   * Set the mode of this device.
   *
   * @param mode The mode (or `idle` to power off)
   */
  async changeMode(mode: string) {
    if (mode === "idle") {
      return this.setPower(false);
    }
    if (!this.getState("power")) {
      // Not powered on, power on
      await this.setPower(true);
    }

    try {
      const result = await this.call("set_mode", [mode], {
        refresh: ["power", "mode"],
        refreshDelay: 200,
      });
      return MiioApi.checkOk(result);
    } catch (err) {
      throw (err as { code?: number }).code === -5001
        ? new Error("Mode `" + mode + "` not supported")
        : err;
    }
  }

  changeTargetHumidity(humidity: number) {
    return this.call("set_limit_hum", [humidity], {
      refresh: ["targetHumidity"],
    }).then(MiioApi.checkOk);
  }

  /**
   * Set the LED brightness to either `bright`, `dim` or `off`.
   *
   * @param level `bright`, `dim` or `off`
   */
  async changeLEDBrightness(level: string) {
    const value = LED_BRIGHTNESS[level];
    if (value === undefined) {
      throw new Error("Invalid LED brigthness: " + level);
    }
    return this.call("set_led_b", [value], { refresh: ["ledBrightness"] }).then(
      () => null,
    );
  }
}
