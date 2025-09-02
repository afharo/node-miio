import { Thing, SwitchableMode } from "abstract-things";

export class Mode extends Thing.mixin(
  (Parent) =>
    class extends Parent.with(SwitchableMode) {
      propertyUpdated(key, value) {
        if (key === "mode") {
          this.updateMode(value);
        }

        super.propertyUpdated(key, value);
      }
    },
) {}
