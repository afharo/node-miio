import { Thing } from "abstract-things";
import { Colorable as ATColorable } from "abstract-things/lights";

export class Colorable extends Thing.mixin(
  (Parent) =>
    class extends Parent.with(ATColorable) {
      propertyUpdated(key, value) {
        if (key === "color") {
          this.updateColor(value);
        }

        super.propertyUpdated(key, value);
      }
    },
) {}
