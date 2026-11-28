import type { Vacuum } from "./vacuum.js";
import type { MiotVacuum } from "./miot-vacuum.js";
import type { ViomiVacuum } from "./viomivacuum.js";
import type { DreameVacuum } from "./dreamevacuum.js";
import type { MijiaVacuum } from "./mijiavacuum.js";
import { VacuumThing } from "./vacuum_thing.js";

/**
 * Any vacuum returned by `device()`. Only the API they all share is available: narrow it with `instanceof` to use the
 * API of a specific implementation (e.g. `device instanceof Vacuum` for the Roborock-only commands).
 */
export type VacuumDevice =
  | Vacuum
  | MiotVacuum
  | ViomiVacuum
  | DreameVacuum
  | MijiaVacuum;

/**
 * Whether the device returned by `device()` is a vacuum.
 *
 * @param device The device
 * @returns `true` if it's a vacuum (it matches `type:vacuum`)
 */
export function isVacuum(device: unknown): device is VacuumDevice {
  return device instanceof VacuumThing;
}
