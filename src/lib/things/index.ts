/**
 * node-miio's thing model: a {@link MiioThing} base with state, events and a lifecycle, and capabilities composed into
 * it with {@link compose}.
 *
 * It replaces abstract-things (MIT, see LICENSE.md), keeping the API its devices exposed: the same capability names,
 * methods, events and event delivery (queued and coalesced per tick).
 */
export { MiioThing, Metadata, type EmitOptions } from "./thing";
export { Capability, type CapabilityStatics } from "./capability";
export { compose, type Composed } from "./compose";
export { CAPABILITY_HOOKS, type CapabilityHook } from "./registry";
export * from "./capabilities/index";
export * from "./values";
export { Color, color, type ColorInput, type ColorModel } from "./color";
