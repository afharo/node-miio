import { Capability } from "../capability";
import { boolean } from "../values";

/** Reports whether it's on (`powerChanged`) */
export class Power extends Capability {
  static capability = "power";
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
