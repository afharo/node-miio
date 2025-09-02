import { Thing } from "abstract-things";
import { Dimmable as ATDimmable } from "abstract-things/lights";

export class Dimmable extends Thing.mixin(
  (Parent) =>
    class extends Parent.with(ATDimmable) {
      propertyUpdated(key, value) {
        if (key === "brightness") {
          this.updateBrightness(value);
        }

        super.propertyUpdated(key, value);
      }
    },
) {}
