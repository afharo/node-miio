import { Capability } from "../capability";
import { boolean } from "../values";

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
  activateCharging(): Promise<unknown> {
    throw new Error("activateCharging not implemented");
  }
}
