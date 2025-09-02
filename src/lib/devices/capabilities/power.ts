import { Thing, SwitchablePower } from "abstract-things";

export class Power extends Thing.mixin(
  (Parent) =>
    class extends Parent.with(SwitchablePower) {
      propertyUpdated<T>(key: string, value: T) {
        if (key === "power" && value !== undefined) {
          this.updatePower(value);
        }

        super.propertyUpdated(key, value);
      }
    },
) {}
