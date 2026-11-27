import type { ActionDefinition } from "./action_metadata";
import type { MiioThing } from "./thing";

/**
 * Base of the capabilities (battery level, charging, power…), composed into things with {@link compose}.
 *
 * Rules of a capability:
 * - It's a named class extending `Capability` (or another capability). It's typed as a {@link MiioThing}, so it can use
 *   `this.updateState(…)`, `this.emitEvent(…)`…, but it isn't instantiated: `compose` copies its members.
 * - No constructor nor instance fields: they never run. Declare the initial state with `static initialState`, and keep
 *   other per-instance data under symbols (created lazily).
 * - Declare its name with `static capability` (or `static capabilities`), and its types (if any) with `static type`.
 * - Declare the methods callers can use (not the `update…`/`change…` ones) with `static actions`: `node-miio inspect`
 *   lists them (see {@link ActionDefinition}). A test checks they match the methods.
 * - `super` works between capabilities (e.g. `CleaningState` → `ErrorState`), not into the class it's composed into.
 *   Use the hooks (`capabilityInit`, `capabilityDestroy`, `capabilityPropertyUpdated`) to take part in its lifecycle.
 * - Two unrelated capabilities can't define the same member: `compose` throws.
 */
export const Capability =
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- only the root of the capabilities' class chains
  class Capability {} as unknown as abstract new () => MiioThing;
export type Capability = MiioThing;

/** Static members a capability may declare */
export interface CapabilityStatics {
  capability?: string;
  capabilities?: string[];
  type?: string;
  types?: string[];
  initialState?: Record<string, unknown>;
  actions?: ActionDefinition[];
}
