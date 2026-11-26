import { compose } from "../things/compose";
import { Colorable } from "../things/capabilities/lights/colorable";
import {
  ColorTemperature,
  ColorFull,
} from "../things/capabilities/lights/color-temperature";
import { type LightChangeOptions } from "../things/capabilities/lights/light";
import { color, type Color } from "../things/color";
import { MiioApi } from "../device";

import { Yeelight, TEMPERATURE_RANGE, clampTemperature } from "./yeelight";

interface RGB {
  red: number;
  green: number;
  blue: number;
}

/** The properties that make up the current colour */
const COLOR_PROPERTIES = [
  "colorTemperature",
  "colorMode",
  "colorRGB",
  "colorHue",
  "colorSaturation",
  "brightness",
];

/** Yeelights with full colour (RGB, HSV) and colour temperature */
export class YeelightColor extends compose(
  Yeelight,
  Colorable,
  ColorTemperature,
  ColorFull,
) {
  constructor(handle: ConstructorParameters<typeof MiioApi>[0]) {
    super(handle);

    // Color temperature
    this.defineProperty("ct", {
      name: "colorTemperature",
      mapper: (v: string) => parseInt(v, 10),
    });

    this.defineProperty("rgb", {
      name: "colorRGB",
      mapper: (v: string): RGB => {
        const rgb = parseInt(v, 10);

        return {
          red: (rgb >> 16) & 0xff,
          green: (rgb >> 8) & 0xff,
          blue: rgb & 0xff,
        };
      },
    });

    this.defineProperty("hue", {
      name: "colorHue",
      mapper: (v: string) => parseInt(v, 10),
    });

    this.defineProperty("sat", {
      name: "colorSaturation",
      mapper: (v: string) => parseInt(v, 10),
    });

    // TODO: Do all Yeelights use the same color range?
    this.updateColorTemperatureRange(
      TEMPERATURE_RANGE.min,
      TEMPERATURE_RANGE.max,
    );
  }

  propertyUpdated(key: string, value: unknown, oldValue?: unknown) {
    if (COLOR_PROPERTIES.includes(key)) {
      let currentColor = this.getState<Color | null>("color");
      switch (this.property("colorMode")) {
        case "colorTemperature":
          // Currently using color temperature mode, parse as temperature
          currentColor = color.temperature(
            this.property<number>("colorTemperature"),
          );
          break;
        case "rgb": {
          // Using RGB, parse if we have gotten the RGB value
          const rgb = this.property<RGB | undefined>("colorRGB");
          if (rgb) {
            currentColor = color.rgb(rgb.red, rgb.green, rgb.blue);
          }
          break;
        }
        case "hsv": {
          // Using HSV, parse the hue, saturation and get the brightness to set color
          const hue = this.property<number | undefined>("colorHue");
          const saturation = this.property<number | undefined>(
            "colorSaturation",
          );

          if (typeof hue !== "undefined" && typeof saturation !== "undefined") {
            currentColor = color.hsv(
              hue,
              saturation,
              this.property<number>("brightness"),
            );
          }
        }
      }

      if (currentColor) {
        this.updateColor(currentColor);
      }
    }

    super.propertyUpdated(key, value, oldValue);
  }

  changeColor(value: Color, options: LightChangeOptions) {
    if (value.is("temperature")) {
      // The user has request a color via temperature
      const temperature = clampTemperature(value.temperature.kelvins);
      return this.call(
        "set_ct_abx",
        Yeelight.withEffect(temperature, options.duration),
        {
          refresh: ["colorTemperature", "colorMode"],
        },
      ).then(MiioApi.checkOk);
    } else if (value.is("hsl") || value.is("hsv")) {
      // The user has requested hue and saturation
      return this.call(
        "set_hsv",
        Yeelight.withEffect([value.hue, value.saturation], options.duration),
        {
          refresh: ["colorHue", "colorSaturation", "colorMode"],
        },
      ).then(MiioApi.checkOk);
    }

    // Fallback to applying via RGB
    const rgb = value.rgb;
    return this.call(
      "set_rgb",
      Yeelight.withEffect(
        rgb.red * 65536 + rgb.green * 256 + rgb.blue,
        options.duration,
      ),
      {
        refresh: ["colorRGB", "colorMode"],
      },
    ).then(MiioApi.checkOk);
  }
}
