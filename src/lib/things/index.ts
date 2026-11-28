/**
 * node-miio's thing model: a {@link MiioThing} base with state, events and a lifecycle, and capabilities composed into
 * it with {@link compose}.
 *
 * It replaces abstract-things (MIT, see LICENSE.md), keeping the API its devices exposed: the same capability names,
 * methods, events and event delivery (queued and coalesced per tick).
 */
export {
  MiioThing,
  Metadata,
  thingActions,
  type EmitOptions,
} from "./thing.js";
export type {
  ActionArgument,
  ActionDefinition,
  ActionMetadata,
} from "./action_metadata.js";
export { Capability, type CapabilityStatics } from "./capability.js";
export { compose, type Composed } from "./compose.js";
export { CAPABILITY_HOOKS, type CapabilityHook } from "./registry.js";
export * from "./capabilities/index.js";
export * from "./values.js";
export { Color, color, type ColorInput, type ColorModel } from "./color.js";
