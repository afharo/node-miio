import { Dimmable as BaseDimmable } from "../../things/capabilities/lights/brightness";

/** Dimmable light, following the `brightness` property */
export class Dimmable extends BaseDimmable {
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "brightness") {
      this.updateBrightness(value as number);
    }
  }
}
