import { Thing, SwitchableMode } from "abstract-things";

export const Mode = Thing.mixin(
  (Parent) =>
    class extends Parent.with(SwitchableMode) {
      propertyUpdated(key, value) {
        if (key === "mode") {
          this.updateMode(value);
        }

        super.propertyUpdated(key, value);
      }
    },
);
