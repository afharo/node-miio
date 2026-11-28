import { Colorable as BaseColorable } from "../../things/capabilities/lights/colorable.js";
import type { Color } from "../../things/color.js";

/** Colorable light, following the `color` property */
export class Colorable extends BaseColorable {
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "color") {
      this.updateColor(value as Color);
    }
  }
}
