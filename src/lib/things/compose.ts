import { Capability, type CapabilityStatics } from "./capability.js";
import {
  CAPABILITY_HOOKS,
  REGISTRY,
  type CapabilityHook,
  type Registry,
} from "./registry.js";
import type { MiioThing } from "./thing.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyConstructor<T = object> = abstract new (...args: any[]) => T;

type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

/** The instance type of `base` with all the capabilities */
export type Composed<
  B extends AnyConstructor<MiioThing>,
  C extends AnyConstructor<Capability>[],
> = InstanceType<B> & UnionToIntersection<InstanceType<C[number]>>;

const HOOKS = new Set<string>(CAPABILITY_HOOKS);

/**
 * The capability classes of a capability, from the top-most ancestor (below {@link Capability}) down to itself.
 *
 * @param capability The capability
 * @returns Its class chain
 */
function classChain(capability: AnyConstructor): AnyConstructor[] {
  const chain: AnyConstructor[] = [];
  for (
    let c = capability;
    c && c !== Capability && c !== Function.prototype;
    c = Object.getPrototypeOf(c)
  ) {
    chain.unshift(c);
  }
  if (Object.getPrototypeOf(chain[0] ?? Function.prototype) !== Capability) {
    throw new Error(
      `compose: ${capability.name} is not a capability (it doesn't extend Capability)`,
    );
  }
  return chain;
}

/**
 * The registry of the closest composed ancestor of a class, to avoid applying a capability twice.
 *
 * @param base The class
 * @returns The classes already applied
 */
function appliedIn(base: object): Set<object> {
  const registry = (base as { [REGISTRY]?: Registry })[REGISTRY];
  return new Set(registry?.applied ?? []);
}

/**
 * Creates a class extending `base` with the given capabilities, e.g.:
 *
 * ```ts
 * export class VacuumThing extends compose(MiioDevice, BatteryLevel, AutonomousCharging) {
 *   static type = "vacuum";
 * }
 * ```
 *
 * The capabilities' members are copied onto a class between the new class and `base`, so the new class can override
 * them (and call them with `super`). A capability shared by several others (e.g. `CleaningState`) is applied once, and
 * so is one that `base` already has.
 *
 * @param base The class to extend
 * @param capabilities The capabilities to add (see {@link Capability})
 * @returns The composed class
 */
export function compose<
  B extends AnyConstructor<MiioThing>,
  C extends AnyConstructor<Capability>[],
>(base: B, ...capabilities: C): B & AnyConstructor<Composed<B, C>> {
  // @ts-expect-error TS can't type an anonymous class extending a generic abstract constructor (it's a mixin)
  const composed = class extends base {};
  const applied = appliedIn(base);
  const owners = new Map<PropertyKey, AnyConstructor>();
  const registry: Registry = {
    applied,
    types: [],
    capabilities: [],
    initialState: {},
    actions: [],
    hooks: {
      capabilityInit: [],
      capabilityDestroy: [],
      capabilityPropertyUpdated: [],
    },
  };

  for (const capability of capabilities) {
    for (const cls of classChain(capability)) {
      if (applied.has(cls)) continue;
      applied.add(cls);

      for (const key of Reflect.ownKeys(cls.prototype)) {
        if (key === "constructor") continue;
        // An own key always has a descriptor
        const descriptor = Object.getOwnPropertyDescriptor(
          cls.prototype,
          key,
        ) as PropertyDescriptor;
        if (typeof key === "string" && HOOKS.has(key)) {
          registry.hooks[key as CapabilityHook].push(descriptor.value);
          continue;
        }
        const owner = owners.get(key);
        if (owner && !(cls.prototype instanceof owner)) {
          throw new Error(
            `compose: ${cls.name}.${String(key)} conflicts with ${owner.name}.${String(key)}`,
          );
        }
        owners.set(key, cls);
        Object.defineProperty(composed.prototype, key, descriptor);
      }

      const statics = cls as unknown as CapabilityStatics;
      const own = (key: keyof CapabilityStatics) =>
        Object.prototype.hasOwnProperty.call(cls, key)
          ? statics[key]
          : undefined;
      const names = (value: unknown) =>
        typeof value === "string" ? [value] : ((value as string[]) ?? []);
      const capabilityNames = [
        ...names(own("capability")),
        ...names(own("capabilities")),
      ];
      const typeNames = [...names(own("type")), ...names(own("types"))];
      registry.capabilities.push(...capabilityNames);
      registry.types.push(...typeNames);
      const actions = own("actions") as CapabilityStatics["actions"];
      if (actions) {
        registry.actions.push({
          definitions: actions,
          tags: [
            ...capabilityNames.map((c) => `cap:${c}`),
            ...typeNames.map((t) => `type:${t}`),
          ],
        });
      }
      Object.assign(registry.initialState, own("initialState") ?? {});
    }
  }

  Object.defineProperty(composed, REGISTRY, { value: registry });
  Object.defineProperty(composed, "name", {
    value: `${base.name}+${capabilities.map((c) => c.name).join("+")}`,
  });
  return composed as unknown as B & AnyConstructor<Composed<B, C>>;
}
