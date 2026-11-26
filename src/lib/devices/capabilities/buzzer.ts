import { boolean } from "../../things/values";
import { MiioApi } from "../../device";

import { DeviceCapability } from "./device_capability";

/** The buzzer of the device can be switched on and off (`set_buzzer`). Emits `buzzerChanged`. */
export class Buzzer extends DeviceCapability {
  static capability = "miio:buzzer";

  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "buzzer" && this.updateState("buzzer", value)) {
      this.emitEvent("buzzerChanged", value);
    }
  }

  /**
   * Gets or sets whether the buzzer is active.
   *
   * @param active The buzzer state to set
   * @returns Whether the buzzer is active (a promise when setting it)
   */
  buzzer(active?: boolean | string): boolean | Promise<boolean> {
    if (active === undefined) return this.getBuzzer();
    return this.setBuzzer(active);
  }

  getBuzzer(): boolean {
    return this.getState<boolean>("buzzer");
  }

  /**
   * Activates or deactivates the buzzer.
   *
   * @param active Whether it should beep
   * @returns Whether the buzzer is active
   */
  async setBuzzer(active: boolean | string): Promise<boolean> {
    await this.changeBuzzer(boolean(active));
    return this.getBuzzer();
  }

  /**
   * Activates or deactivates the buzzer of the device.
   *
   * @param active Whether it should beep
   */
  async changeBuzzer(active: boolean) {
    const result = await this.call("set_buzzer", [active ? "on" : "off"], {
      refresh: ["buzzer"],
    });
    return MiioApi.checkOk(result);
  }
}
