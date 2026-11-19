/** The states in which a vacuum reports an error */
const ERROR_STATES = ["error", "charging-error", "charger-offline"];

interface ErrorStateful {
  updateState<T>(key: string, value: T): boolean;
  emitEvent(event: string, data?: unknown): void;
}

/**
 * Clears the error once the vacuum leaves the error states. abstract-things only clears it with `updateError(null)`,
 * which the vacuums never called: once reported, an error was never cleared (`errorChanged` never emitted `null`).
 *
 * It doesn't use `updateError(null)` because that also marks the vacuum as not cleaning (wrong for e.g. `paused`).
 *
 * @param vacuum The vacuum
 * @param state The new state
 */
export function clearErrorOnRecovery(vacuum: object, state: unknown) {
  if (ERROR_STATES.includes(state as string)) return;
  // Every vacuum has these (abstract-things' State and Thing), but not every mixin chain is typed
  const stateful = vacuum as ErrorStateful;
  if (stateful.updateState("error", null)) {
    stateful.emitEvent("errorChanged", null);
    stateful.emitEvent("errorCleared");
  }
}
