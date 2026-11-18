import { Thing, State } from "abstract-things";
import { string } from "abstract-things/values";

export const LEDBrightness = Thing.mixin(
  (Parent) =>
    class extends Parent.with(State) {
      static get capability() {
        return "miio:led-brightness";
      }

      static availableAPI(builder) {
        builder
          .action("ledBrightness")
          .description("Get or set the LED brightness")
          .argument(
            "string",
            true,
            "If provided, set the LED brightness to this value",
          )
          .returns("string", "The LED brightness")
          .done();
      }

      propertyUpdated(key, value) {
        if (key === "ledBrightness") {
          this.updateState("ledBrightness", value);
        }

        super.propertyUpdated(key, value);
      }

      /**
       * Get or set if the LED brightness.
       *
       * @param {string} brightness The LED brightness
       */
      async ledBrightness(brightness?: string | unknown) {
        if (typeof brightness === "undefined") {
          return this.getState("ledBrightness");
        }

        return this.changeLEDBrightness(string(brightness)).then(() =>
          this.getState("ledBrightness"),
        );
      }

      /**
       * Set the LED brightness.
       *
       * @param _brightness
       */
      async changeLEDBrightness(_brightness: string) {
        throw new Error("changeLEDBrightness not implemented");
      }
    },
);
