import { Capability } from "../capability";
import {
  boolean,
  code,
  percentage,
  type Code,
  type CodeInput,
} from "../values";

/** Reports an error (`errorChanged` with `{ id, description }`, or `null` when cleared) */
export class ErrorState extends Capability {
  static capability = "error-state";
  static initialState: Record<string, unknown> = { error: null };

  /** The current error, or `null` */
  get error(): Promise<Code | null> {
    return Promise.resolve(this.getState<Code | null>("error"));
  }

  /**
   * Sets (or clears, with `null`) the error. Emits `errorChanged`, and `error` / `errorCleared`.
   *
   * @param error The error
   */
  updateError(error: CodeInput | null | undefined) {
    const value = error ? code(error) : null;
    if (this.updateState("error", value)) {
      this.emitEvent("errorChanged", value);
      if (value) {
        this.emitEvent("error", value);
      } else {
        this.emitEvent("errorCleared");
      }
    }
  }
}

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
  changePower(_power: boolean): Promise<unknown> | unknown {
    throw new Error("changePower has not been implemented");
  }
}

/** Reports its mode (`modeChanged`) and the available ones (`modesChanged`) */
export class Mode extends Capability {
  static capability = "mode";
  static initialState: Record<string, unknown> = { mode: null, modes: [] };

  mode(): Promise<string | null> {
    return Promise.resolve(this.getState<string | null>("mode"));
  }

  /**
   * Updates the mode. Emits `modeChanged`.
   *
   * @param mode The mode
   */
  updateMode(mode: string | null) {
    if (this.updateState("mode", mode)) {
      this.emitEvent("modeChanged", mode);
    }
  }

  modes(): Promise<Code[]> {
    return Promise.resolve(this.getState<Code[]>("modes"));
  }

  /**
   * Updates the available modes. Emits `modesChanged`.
   *
   * @param modes The modes (see {@link code})
   */
  updateModes(modes: CodeInput[]) {
    const mapped = modes.map((m) => code(m));
    if (this.updateState("modes", mapped)) {
      this.emitEvent("modesChanged", mapped);
    }
  }
}

/** The mode can be changed. Implement `changeMode(mode)`. */
export class SwitchableMode extends Mode {
  static capability = "switchable-mode";

  /**
   * Gets the mode, or sets it.
   *
   * @param mode The mode to set
   * @returns The mode
   */
  mode(mode?: string): Promise<string | null> {
    if (mode !== undefined) return this.setMode(mode);
    return super.mode();
  }

  /**
   * Changes the mode.
   *
   * @param mode The mode
   * @returns The new mode
   */
  async setMode(mode: string): Promise<string | null> {
    if (mode === undefined) throw new Error("Mode must be specified");
    await this.changeMode(String(mode));
    return this.getState<string | null>("mode");
  }

  /**
   * Changes the mode of the device. Implemented by the devices.
   *
   * @param _mode The mode
   */
  changeMode(_mode: string): Promise<unknown> | unknown {
    throw new Error("changeMode has not been implemented");
  }
}

/** Reports its battery level (`batteryLevelChanged`), `-1` until known */
export class BatteryLevel extends Capability {
  static capability = "battery-level";
  static initialState: Record<string, unknown> = { batteryLevel: -1 };

  batteryLevel(): Promise<number> {
    return Promise.resolve(this.getState<number>("batteryLevel"));
  }

  /**
   * Updates the battery level. Emits `batteryLevelChanged`.
   *
   * @param level The level (0-100)
   */
  updateBatteryLevel(level: number | string) {
    const value = percentage(level);
    if (this.updateState("batteryLevel", value)) {
      this.emitEvent("batteryLevelChanged", value);
    }
  }
}

/** Reports whether it's charging (`chargingChanged`, `chargingStarted`, `chargingStopped`) */
export class ChargingState extends Capability {
  static capability = "charging-state";
  static initialState: Record<string, unknown> = { charging: false };

  get charging(): Promise<boolean> {
    return Promise.resolve(this.getState<boolean>("charging"));
  }

  /**
   * Updates the charging state.
   *
   * @param charging Whether it's charging
   */
  updateCharging(charging: boolean | string | number) {
    const value = boolean(charging);
    if (this.updateState("charging", value)) {
      this.emitEvent("chargingChanged", value);
      this.emitEvent(value ? "chargingStarted" : "chargingStopped");
    }
  }
}

/** Can go charge by itself (e.g. a vacuum returning to its dock). Implement `activateCharging()`. */
export class AutonomousCharging extends ChargingState {
  static capability = "autonomous-charging";

  async charge(): Promise<null> {
    await this.activateCharging();
    return null;
  }

  /** Sends the device to charge. Implemented by the devices. */
  activateCharging(): Promise<unknown> | unknown {
    throw new Error("activateCharging not implemented");
  }
}

/** Its name can be changed. Implement `changeName(name)`. */
export class Nameable extends Capability {
  static capability = "nameable";

  /**
   * Changes the name.
   *
   * @param name The name
   * @returns The new name
   */
  async setName(name: string): Promise<string | undefined> {
    await this.changeName(name);
    return this.metadata.name;
  }

  /**
   * Changes the name of the device. Implemented by the devices.
   *
   * @param _name The name
   */
  changeName(_name: string): Promise<unknown> | unknown {
    throw new Error("changeName has not been implemented");
  }
}

/** Emits actions (e.g. a button's `click`): `action` (`{ action, data }`) and `action:<action>` */
export class Actions extends Capability {
  static capability = "actions";
  static initialState: Record<string, unknown> = { actions: [] };

  /**
   * Emits an action.
   *
   * @param action The action
   * @param extra Its data
   */
  emitAction(action: string, extra: Record<string, unknown> = {}) {
    this.emitEvent("action", { action, data: extra }, { multiple: true });
    this.emitEvent(`action:${action}`, extra, { multiple: true });
  }

  actions(): Promise<Code[]> {
    return Promise.resolve(this.getState<Code[]>("actions"));
  }

  /**
   * Updates the available actions. Emits `actionsChanged`.
   *
   * @param actions The actions (see {@link code})
   */
  updateActions(actions: CodeInput[]) {
    const mapped = actions.map((a) => code(a));
    if (this.updateState("actions", mapped)) {
      this.emitEvent("actionsChanged", mapped);
    }
  }
}
