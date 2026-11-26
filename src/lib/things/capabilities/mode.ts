import { Capability } from "../capability";
import { code, type Code, type CodeInput } from "../values";

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
