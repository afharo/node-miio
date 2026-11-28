import type { ActionDefinition } from "./action_metadata.js";

/** Where {@link compose} records what the capabilities of a composed class contribute */
export const REGISTRY = Symbol("node-miio:capabilities");

/**
 * Lifecycle hooks a capability can implement (as methods). They're collected by `compose` instead of being copied, so
 * several capabilities can implement the same hook:
 * - `capabilityInit()`: after `initCallback()`, during `init()`
 * - `capabilityDestroy()`: after `destroyCallback()`, during `destroy()`
 * - `capabilityPropertyUpdated(key, value, oldValue)`: when a device property changes (see `MiioDevice.setProperty`)
 */
export const CAPABILITY_HOOKS = [
  "capabilityInit",
  "capabilityDestroy",
  "capabilityPropertyUpdated",
] as const;

export type CapabilityHook = (typeof CAPABILITY_HOOKS)[number];

export interface Registry {
  /** The capability classes already applied (including their ancestors) */
  applied: Set<object>;
  types: string[];
  capabilities: string[];
  initialState: Record<string, unknown>;
  /** The actions each capability declares, with its tags, in the order they're applied */
  actions: { definitions: ActionDefinition[]; tags: string[] }[];
  hooks: Record<CapabilityHook, ((...args: unknown[]) => unknown)[]>;
}
