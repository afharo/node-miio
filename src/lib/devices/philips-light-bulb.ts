import { MiioApi } from "../device";
import { compose } from "../things/compose";
import { LightBulb, ColorTemperature } from "../things/capabilities/lights";
import { color, type Color } from "../things/color";

import { Power } from "./capabilities/power";
import { Dimmable } from "./capabilities/dimmable";
import { Colorable } from "./capabilities/colorable";

const MIN_TEMP = 3000;
const MAX_TEMP = 5700;

export class PhilipsLightBulb extends compose(
  MiioApi,
  LightBulb,
  Power,
  Dimmable,
  Colorable,
  ColorTemperature,
) {
  static get type() {
    return "miio:philiphs-ball-lamp";
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

    this.defineProperty("cct", {
      name: "color",
      mapper: (v: string) => {
        const value = parseInt(v, 10);
        return color.temperature(
          MIN_TEMP + (value / 100) * (MAX_TEMP - MIN_TEMP),
        );
      },
    });

    this.updateColorTemperatureRange(MIN_TEMP, MAX_TEMP);
  }

  changePower(power: boolean) {
    return this.call("set_power", [power ? "on" : "off"], {
      refresh: ["power"],
    }).then(MiioApi.checkOk);
  }

  changeBrightness(brightness: number) {
    return this.call("set_bright", [brightness], {
      refresh: ["brightness"],
    }).then(MiioApi.checkOk);
  }

  changeColor(value: Color) {
    const kelvins = value.temperature.kelvins;
    let temp;
    if (kelvins <= MIN_TEMP) {
      temp = 1;
    } else if (kelvins >= MAX_TEMP) {
      temp = 100;
    } else {
      temp = Math.round(((kelvins - MIN_TEMP) / (MAX_TEMP - MIN_TEMP)) * 100);
    }

    return this.call("set_cct", [temp], {
      refresh: ["color"],
    }).then(MiioApi.checkOk);
  }
}
