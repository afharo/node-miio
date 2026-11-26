import { Capability } from "../../things/capability";
import { string } from "../../things/values";

/** The brightness of the LED of the device can be changed. Implement `changeLEDBrightness(brightness)`. */
export class LEDBrightness extends Capability {
  static capability = "miio:led-brightness";

  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "ledBrightness") {
      this.updateState("ledBrightness", value);
    }
  }

  /**
   * Gets or sets the LED brightness.
   *
   * @param brightness The LED brightness to set
   * @returns The LED brightness
   */
  async ledBrightness(brightness?: unknown): Promise<string> {
    if (brightness !== undefined) {
      await this.changeLEDBrightness(string(brightness));
    }
    return this.getState<string>("ledBrightness");
  }

  /**
   * Changes the LED brightness of the device. Implemented by the devices.
   *
   * @param _brightness The LED brightness
   */
  async changeLEDBrightness(_brightness: string): Promise<unknown> {
    throw new Error("changeLEDBrightness not implemented");
  }
}
