import {
  Thing,
  BatteryLevel as AbstractThingsBatteryLevel,
} from "abstract-things";

export class BatteryLevel extends Thing.mixin(
  (Parent) =>
    class BatteryLevel extends Parent.with(AbstractThingsBatteryLevel) {
      propertyUpdated(key, value) {
        if (key === "batteryLevel") {
          this.updateBatteryLevel(value);
        }

        super.propertyUpdated(key, value);
      }
    },
) {}
