import { Capability } from "../capability.js";
import { code, type Code, type CodeInput } from "../values.js";

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
