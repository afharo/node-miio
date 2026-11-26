/**
 * What the robot is doing, in broad terms: one per operational state of the Matter RVC cluster (revision 4), so the
 * plugins can translate any {@link VacuumState} without guessing.
 */
export type VacuumActivity =
  | "stopped"
  | "running"
  | "paused"
  | "returning"
  | "charging"
  | "docked"
  | "error"
  | "emptying-dust-bin"
  | "cleaning-mop"
  | "filling-water-tank"
  | "updating-maps";

/**
 * Every state (`state` property) a vacuum can report, and its {@link VacuumActivity}. Every vacuum class (legacy miIO,
 * Viomi, Dreame and MIoT) reports one of these, or `unknown-<code>` for a status it can't translate.
 */
export const VACUUM_STATES = {
  initiating: "stopped",
  idle: "stopped",
  waiting: "stopped",
  sleeping: "stopped",
  "shutting-down": "stopped",
  updating: "stopped",
  cleaning: "running",
  "spot-cleaning": "running",
  "zone-cleaning": "running",
  "room-cleaning": "running",
  // Viomi
  "cleaning-and-mopping": "running",
  "remote-control": "running",
  "manual-mode": "running",
  "going-to-location": "running",
  relocating: "running",
  mapping: "updating-maps",
  paused: "paused",
  returning: "returning",
  docking: "returning",
  "returning-to-wash-mop": "returning",
  charging: "charging",
  "fully-charged": "docked",
  /** On the dock, neither charging nor busy (e.g. a dock activity just finished) */
  docked: "docked",
  error: "error",
  "charging-error": "error",
  "dust-collection": "emptying-dust-bin",
  "washing-mop": "cleaning-mop",
  "drying-mop": "cleaning-mop",
  /** The dock is busy, without saying with what (washing, drying, emptying, changing the mop, self-cleaning…) */
  "station-working": "cleaning-mop",
  "filling-water-tank": "filling-water-tank",
} as const satisfies Record<string, VacuumActivity>;

/** A state reported by a vacuum (see {@link VACUUM_STATES}) */
export type VacuumState = keyof typeof VACUUM_STATES;

/**
 * @param state The vacuum's `state` property
 * @returns `true` if it's one of {@link VACUUM_STATES} (`false` for `unknown-<code>`)
 */
export function isKnownVacuumState(state: unknown): state is VacuumState {
  return typeof state === "string" && Object.hasOwn(VACUUM_STATES, state);
}

/**
 * @param state The vacuum's `state` property
 * @returns What the robot is doing, or `undefined` for an unknown state
 */
export function vacuumActivity(state: unknown): VacuumActivity | undefined {
  return isKnownVacuumState(state) ? VACUUM_STATES[state] : undefined;
}

/** The vacuum states (`state` property) in which the robot is cleaning (not paused, returning or docked) */
export const CLEANING_STATES: readonly VacuumState[] = [
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
  return (
    typeof state === "string" &&
    (CLEANING_STATES as readonly string[]).includes(state)
  );
}
