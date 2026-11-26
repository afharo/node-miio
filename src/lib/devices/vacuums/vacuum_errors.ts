import type { MiioThing } from "../../things/thing";

/** The states in which a vacuum reports an error */
const ERROR_STATES = ["error", "charging-error", "charger-offline"];

/**
 * Clears the error once the vacuum leaves the error states. Otherwise it's only cleared with `updateError(null)`,
 * which the vacuums never call: once reported, an error would never be cleared (`errorChanged` never emitting `null`).
 *
 * It doesn't use `updateError(null)` because that also marks the vacuum as not cleaning (wrong for e.g. `paused`).
 *
 * @param vacuum The vacuum
 * @param state The new state
 */
export function clearErrorOnRecovery(vacuum: MiioThing, state: unknown) {
  if (ERROR_STATES.includes(state as string)) return;
  if (vacuum.updateState("error", null)) {
    vacuum.emitEvent("errorChanged", null);
    vacuum.emitEvent("errorCleared");
  }
}
