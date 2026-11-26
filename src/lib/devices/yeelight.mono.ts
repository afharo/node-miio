import { compose } from "../things/compose";
import { Colorable } from "../things/capabilities/lights/colorable";
import { ColorTemperature } from "../things/capabilities/lights/color-temperature";
import { type LightChangeOptions } from "../things/capabilities/lights/light";
import { color, type Color } from "../things/color";
import { MiioApi } from "../device";

import { Yeelight, TEMPERATURE_RANGE, clampTemperature } from "./yeelight";

/** Yeelights with a white light of variable colour temperature */
export class YeelightMono extends compose(
  Yeelight,
  Colorable,
  ColorTemperature,
) {
  constructor(handle: ConstructorParameters<typeof MiioApi>[0]) {
    super(handle);

    // Color temperature
    this.defineProperty("ct", {
      name: "colorTemperature",
      mapper: (v: string) => parseInt(v, 10),
    });

    // TODO: Do all Yeelights use the same color range?
    this.updateColorTemperatureRange(
      TEMPERATURE_RANGE.min,
      TEMPERATURE_RANGE.max,
    );
  }

  propertyUpdated(key: string, value: unknown, oldValue?: unknown) {
    if (key === "colorTemperature") {
      this.updateColor(color.temperature(value as number));
    }

    super.propertyUpdated(key, value, oldValue);
  }

  changeColor(value: Color, options: LightChangeOptions) {
    const temperature = clampTemperature(value.temperature.kelvins);
    return this.call(
      "set_ct_abx",
      Yeelight.withEffect(temperature, options.duration),
      {
        refresh: ["colorTemperature"],
      },
    ).then(MiioApi.checkOk);
  }
}
