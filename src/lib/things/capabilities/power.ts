import { Capability } from "../capability";
import { boolean } from "../values";
import type { ActionDefinition } from "../action_metadata";

/** Reports whether it's on (`powerChanged`) */
export class Power extends Capability {
  static capability = "power";
  static actions: ActionDefinition[] = [
    { name: "power", description: "Whether it's on", returns: "boolean" },
  ];
  static initialState: Record<string, unknown> = { power: false };

  power(): Promise<boolean> {
    return Promise.resolve(this.getState<boolean>("power"));
  }

  /**
   * Updates the power state. Emits `powerChanged`.
   *
   * @param power Whether it's on
   */
  updatePower(power: boolean) {
    if (this.updateState("power", power)) {
      this.emitEvent("powerChanged", power);
    }
  }
}

/** Can be switched on and off. Implement `changePower(power)`. */
export class SwitchablePower extends Power {
  static capability = "switchable-power";
  static actions: ActionDefinition[] = [
    {
      name: "power",
      description: "Gets the power state, or sets it",
      arguments: [
        {
          type: "boolean",
          optional: true,
          description: "The power state to set",
        },
      ],
      returns: "boolean",
    },
    {
      name: "setPower",
      description: "Switches it on or off",
      arguments: [{ type: "boolean", description: "Whether to switch it on" }],
      returns: "boolean",
    },
    {
      name: "togglePower",
      description: "Switches it on or off, the opposite of now",
      returns: "boolean",
    },
    { name: "turnOn", description: "Switches it on", returns: "boolean" },
    { name: "turnOff", description: "Switches it off", returns: "boolean" },
  ];

  /**
   * Gets the power state, or sets it.
   *
   * @param power The power state to set
   * @returns The power state
   */
  power(power?: boolean | string | number): Promise<boolean> {
    if (power !== undefined) return this.setPower(power);
    return super.power();
  }

  /**
   * Switches it on or off.
   *
   * @param power Whether to switch it on
   * @returns The power state
   */
  async setPower(power: boolean | string | number): Promise<boolean> {
    await this.changePower(boolean(power));
    return this.getState<boolean>("power");
  }

  async togglePower(): Promise<boolean> {
    return this.setPower(!this.getState<boolean>("power"));
  }

  turnOn() {
    return this.setPower(true);
  }

  turnOff() {
    return this.setPower(false);
  }

  /**
   * Switches the device on or off. Implemented by the devices.
   *
   * @param _power Whether to switch it on
   */
  changePower(_power: boolean): Promise<unknown> {
    throw new Error("changePower has not been implemented");
  }
}
