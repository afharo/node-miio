import { boolean, type CodeInput } from "../values";

import { ErrorState } from "./error-state";

/**
 * Reports whether it's cleaning: `cleaningChanged`, `cleaningStarted`, and `cleaningStopped` with `cleaningDone` (or
 * `cleaningError`, if it stopped because of an error).
 */
export class CleaningState extends ErrorState {
  static capability = "cleaning-state";
  static initialState: Record<string, unknown> = { cleaning: false };

  cleaning(): Promise<boolean> {
    return Promise.resolve(this.getState<boolean>("cleaning"));
  }

  /**
   * Updates the cleaning state.
   *
   * @param cleaning Whether it's cleaning
   */
  updateCleaning(cleaning: boolean | string | number) {
    const value = boolean(cleaning);
    if (this.updateState("cleaning", value)) {
      this.emitEvent("cleaningChanged", value);
      if (value) {
        this.emitEvent("cleaningStarted");
      } else {
        const error = this.getState("error");
        if (error) {
          this.emitEvent("cleaningError", error);
        } else {
          this.emitEvent("cleaningDone");
        }
        this.emitEvent("cleaningStopped");
      }
    }
  }

  /**
   * Sets (or clears) the error, and marks it as not cleaning.
   *
   * @param error The error
   */
  updateError(error: CodeInput | null | undefined) {
    super.updateError(error);
    this.updateCleaning(false);
  }
}

/** Can clean by itself. Implement `activateCleaning()` and `deactivateCleaning()`. */
export class AutonomousCleaning extends CleaningState {
  static capability = "autonomous-cleaning";

  async clean(): Promise<null> {
    await this.activateCleaning();
    return null;
  }

  async stop(): Promise<null> {
    await this.deactivateCleaning();
    return null;
  }

  /** Starts cleaning. Implemented by the devices. */
  activateCleaning(): Promise<unknown> {
    throw new Error("activateCleaning not implemented");
  }

  /** Stops cleaning. Implemented by the devices. */
  deactivateCleaning(): Promise<unknown> {
    throw new Error("deactivateCleaning not implemented");
  }
}

/** Can clean a spot. Implement `activateSpotClean()`. */
export class SpotCleaning extends CleaningState {
  static capability = "spot-cleaning";

  async spotClean(): Promise<null> {
    await this.activateSpotClean();
    return null;
  }

  /** Starts cleaning a spot. Implemented by the devices. */
  activateSpotClean(): Promise<unknown> {
    throw new Error("activateSpotClean not implemented");
  }
}
