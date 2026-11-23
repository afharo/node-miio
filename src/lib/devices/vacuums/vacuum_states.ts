/** The vacuum states (`state` property) in which the robot is cleaning (not paused, returning or docked) */
export const CLEANING_STATES: readonly string[] = [
  "cleaning",
  "spot-cleaning",
  "zone-cleaning",
  "room-cleaning",
  // Viomi
  "cleaning-and-mopping",
];

/**
 * Whether the robot is cleaning in this state. Unlike `cleaning()`, which keeps its value while paused, it's `false`
 * for `paused`.
 *
 * @param state The vacuum's `state` property
 * @returns `true` if the robot is cleaning
 */
export function isCleaningState(state: unknown): boolean {
  return typeof state === "string" && CLEANING_STATES.includes(state);
}
