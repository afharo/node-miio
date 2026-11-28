import { boolean } from "../../things/values.js";
import type { ActionDefinition } from "../../things/action_metadata.js";

import { DeviceCapability } from "./device_capability.js";

/** The LED of the device can be switched on and off (`set_led`), following the `led` property */
export class SwitchableLED extends DeviceCapability {
  static capability = "miio:switchable-led";
  static actions: ActionDefinition[] = [
    {
      name: "led",
      description: "Gets whether the LED is on, or sets it",
      arguments: [
        {
          type: "boolean",
          optional: true,
          description: "Whether the LED is on",
        },
      ],
      returns: "boolean",
    },
  ];

  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "led") {
      this.updateState("led", value);
    }
  }

  /**
   * Gets or sets whether the LED is on.
   *
   * @param power The LED state to set
   * @returns Whether the LED is on (a promise when setting it)
   */
  led(power?: boolean | string): boolean | Promise<boolean> {
    if (power === undefined) return this.getState<boolean>("led");
    return this.changeLED(boolean(power)).then(() =>
      this.getState<boolean>("led"),
    );
  }

  /**
   * Switches the LED on or off.
   *
   * @param power Whether to switch it on
   */
  async changeLED(power: boolean): Promise<null> {
    await this.call("set_led", [power ? "on" : "off"], { refresh: ["led"] });
    return null;
  }
}
