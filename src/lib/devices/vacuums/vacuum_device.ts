import type { Vacuum } from "./vacuum";
import type { MiotVacuum } from "./miot-vacuum";
import type { ViomiVacuum } from "./viomivacuum";
import type { DreameVacuum } from "./dreamevacuum";
import type { MijiaVacuum } from "./mijiavacuum";

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
 * @returns `true` if it's a vacuum (it matches `type:vaccuum`, as abstract-things spells it)
 */
export function isVacuum(device: unknown): device is VacuumDevice {
  return (
    typeof (device as { matches?: unknown })?.matches === "function" &&
    (device as { matches: (tag: string) => boolean }).matches("type:vaccuum")
  );
}
