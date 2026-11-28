import { EventEmitter } from "node:events";
import { isDeepStrictEqual } from "node:util";

import { createDebug, type DebugFn } from "../logger.js";

import { REGISTRY, type CapabilityHook, type Registry } from "./registry.js";
import {
  addActions,
  type ActionDefinition,
  type ActionMetadata,
} from "./action_metadata.js";

export interface EmitOptions<T = unknown> {
  /**
   * Whether several events with the same name can be emitted in the same tick. By default only the last one is emitted.
   * A function keeps the queued events it returns `false` for (e.g. one `stateChanged` per key).
   */
  multiple?: boolean | ((data: T) => boolean);
}

/**
 * Types and capabilities of a thing, used by {@link MiioThing.matches} (`type:vacuum`, `cap:battery-level`…).
 */
export class Metadata {
  readonly types = new Set<string>();
  readonly capabilities = new Set<string>();
  /** The thing this one is a child of, e.g. the gateway of a sensor */
  parent?: MiioThing;
  #name?: string;

  constructor(
    private readonly thing: MiioThing,
    /** The actions it supports, by name (declared by its capabilities and classes with `static actions`) */
    readonly actions: Readonly<Record<string, ActionMetadata>> = {},
  ) {}

  get name() {
    return this.#name;
  }

  set name(name: string | undefined) {
    if (this.#name !== name) {
      this.#name = name;
      this.thing.emitEvent("thing:metadata", this);
    }
  }

  addTypes(...types: string[]) {
    for (const type of types) this.types.add(type);
    this.thing.emitEvent("thing:metadata", this);
    return this;
  }

  addCapabilities(...capabilities: string[]) {
    for (const capability of capabilities) this.capabilities.add(capability);
    this.thing.emitEvent("thing:metadata", this);
    return this;
  }

  removeCapabilities(...capabilities: string[]) {
    for (const capability of capabilities) {
      this.capabilities.delete(capability);
    }
    this.thing.emitEvent("thing:metadata", this);
    return this;
  }

  hasType(type: string) {
    return this.types.has(type);
  }

  hasCapability(capability: string) {
    return this.capabilities.has(capability);
  }

  /**
   * Whether it matches all the given tags.
   *
   * @param tags `type:<type>` or `cap:<capability>`
   * @returns `true` if it matches all of them
   */
  matches(...tags: string[]) {
    return tags.every((tag) => {
      if (tag.startsWith("type:")) return this.hasType(tag.slice(5));
      if (tag.startsWith("cap:")) return this.hasCapability(tag.slice(4));
      return false;
    });
  }
}

interface CollectedRegistry {
  types: string[];
  capabilities: string[];
  initialState: Record<string, unknown>;
  actions: Readonly<Record<string, ActionMetadata>>;
  hooks: Record<CapabilityHook, ((...args: unknown[]) => unknown)[]>;
}

const collected = new WeakMap<object, CollectedRegistry>();

/**
 * Reads a static `type`/`types`/`capability`/`capabilities` declared by the class itself (not inherited).
 *
 * @param cls The class
 * @param key The static
 * @returns The declared names
 */
function ownNames(cls: object, key: string): string[] {
  if (!Object.prototype.hasOwnProperty.call(cls, key)) return [];
  const value = (cls as Record<string, unknown>)[key];
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? (value as string[]) : [];
}

/**
 * Collects the types, capabilities, initial state and hooks of a class and its ancestors (up to `MiioThing`).
 *
 * @param ctor The class of the thing
 * @returns What it collected (cached per class)
 */
function collect(ctor: object): CollectedRegistry {
  const cached = collected.get(ctor);
  if (cached) return cached;

  const chain: object[] = [];
  for (let c = ctor; c && c !== MiioThing; c = Object.getPrototypeOf(c)) {
    chain.unshift(c);
  }

  const actions = new Map<string, ActionMetadata>();
  const result: CollectedRegistry = {
    types: [],
    capabilities: [],
    initialState: {},
    actions: {},
    hooks: {
      capabilityInit: [],
      capabilityDestroy: [],
      capabilityPropertyUpdated: [],
    },
  };
  for (const cls of chain) {
    const registry = (cls as { [REGISTRY]?: Registry })[REGISTRY];
    if (registry && Object.prototype.hasOwnProperty.call(cls, REGISTRY)) {
      result.types.push(...registry.types);
      result.capabilities.push(...registry.capabilities);
      Object.assign(result.initialState, registry.initialState);
      for (const { definitions, tags } of registry.actions) {
        addActions(actions, definitions, tags);
      }
      for (const hook of Object.keys(result.hooks) as CapabilityHook[]) {
        result.hooks[hook].push(...registry.hooks[hook]);
      }
    }
    const types = [...ownNames(cls, "types"), ...ownNames(cls, "type")];
    const capabilities = [
      ...ownNames(cls, "capabilities"),
      ...ownNames(cls, "capability"),
    ];
    result.types.push(...types);
    result.capabilities.push(...capabilities);
    if (Object.prototype.hasOwnProperty.call(cls, "actions")) {
      addActions(actions, (cls as { actions: ActionDefinition[] }).actions, [
        ...capabilities.map((c) => `cap:${c}`),
        ...types.map((t) => `type:${t}`),
      ]);
    }
  }
  result.actions = Object.freeze(Object.fromEntries(actions));
  collected.set(ctor, result);
  return result;
}

/**
 * The actions the things of a class support, from the `static actions` of its capabilities and classes.
 *
 * @param ctor The class of the thing
 * @returns Its actions, by name
 */
export function thingActions(
  ctor: abstract new (...args: never[]) => MiioThing,
): Readonly<Record<string, ActionMetadata>> {
  return collect(ctor).actions;
}

/**
 * Base of every thing (device, sub-device…): an `EventEmitter` with an id, metadata (types and capabilities), state and
 * a lifecycle (`init()` / `destroy()`).
 *
 * Events are queued and emitted asynchronously (`setImmediate`), only the last event of each name per tick (see
 * {@link EmitOptions}). Listeners get `(data, thing)`.
 *
 * Capabilities are added with {@link compose}.
 */
export class MiioThing extends EventEmitter {
  readonly metadata: Metadata;

  #id?: string;
  #state: Map<string, unknown>;
  #eventQueue: [event: string, data: unknown][] = [];
  #initialized = false;
  #destroyed = false;
  #debug?: DebugFn;

  constructor() {
    super();
    const registry = collect(this.constructor);
    this.metadata = new Metadata(this, registry.actions);
    for (const type of registry.types) this.metadata.types.add(type);
    for (const capability of registry.capabilities) {
      this.metadata.capabilities.add(capability);
    }
    this.#state = new Map(
      Object.entries(structuredClone(registry.initialState)),
    );
  }

  /** The identifier, namespaced (e.g. `miio:123456`) */
  get id(): string | null {
    return this.#id ?? null;
  }

  set id(id: string) {
    if (this.#initialized) {
      throw new Error(
        "Identifier can not be changed after initialization has been done",
      );
    }
    if (typeof id !== "string") {
      throw new Error("Identifier should be a string");
    }
    this.#id = id;
  }

  /**
   * Whether it matches all the given tags (`type:<type>` or `cap:<capability>`).
   *
   * @param tags The tags
   * @returns `true` if it matches all of them
   */
  matches(...tags: string[]) {
    return this.metadata.matches(...tags);
  }

  /**
   * Initializes the thing (e.g. connects to the device and loads its properties). Resolves to the thing.
   */
  async init(): Promise<this> {
    if (this.#initialized) return this;
    this.#destroyed = false;

    await this.initCallback();
    await this.runCapabilityHooks("capabilityInit");

    if (typeof this.#id !== "string") {
      throw new Error(
        "Identifier needs to be set either during thing construction or during init",
      );
    }
    if (this.#id.indexOf(":") <= 0) {
      throw new Error(
        `Identifier does not contain a namespace, currently: \`${this.#id}\``,
      );
    }

    this.#initialized = true;
    this.emitEvent("thing:initialized");
    return this;
  }

  /** Override to run initialization tasks. Call `super.initCallback()`. */
  async initCallback(): Promise<void> {}

  /** Destroys the thing, freeing any resources it uses. */
  async destroy(): Promise<void> {
    if (!this.#initialized || this.#destroyed) return;
    this.#destroyed = true;
    this.#initialized = false;

    await this.destroyCallback();
    await this.runCapabilityHooks("capabilityDestroy");
    this.emitEvent("thing:destroyed");
  }

  /** Override to free resources. Call `super.destroyCallback()`. */
  async destroyCallback(): Promise<void> {}

  /**
   * Queues an event, emitted on the next tick.
   *
   * @param event The event
   * @param data Its payload
   * @param options See {@link EmitOptions}
   */
  emitEvent<T>(event: string, data?: T, options?: EmitOptions<T>) {
    const queue = this.#eventQueue;
    const shouldSchedule = queue.length === 0;
    const multiple = options?.multiple ?? false;

    if (!multiple) {
      const idx = queue.findIndex(([e]) => e === event);
      if (idx >= 0) queue.splice(idx, 1);
    } else if (typeof multiple === "function") {
      const idx = queue.findIndex(([e, d]) => e === event && multiple(d as T));
      if (idx >= 0) queue.splice(idx, 1);
    }
    queue.push([event, data]);

    if (shouldSchedule) {
      setImmediate(() => {
        this.#eventQueue = [];
        for (const [e, d] of queue) {
          // An `error` event without listeners would throw (and crash the app)
          if (e === "error" && this.listenerCount("error") === 0) continue;
          this.emit(e, d, this);
        }
      });
    }
  }

  /**
   * The current state.
   *
   * @returns A copy of the state
   */
  async state(): Promise<Record<string, unknown>> {
    return Object.fromEntries(this.#state);
  }

  /**
   * The value of a state key.
   *
   * @param key The key
   * @param defaultValue Returned when the key isn't set
   * @returns The value
   */
  getState<T = unknown>(key: string, defaultValue: T | null = null): T {
    const value = this.#state.get(key);
    return (value === undefined ? defaultValue : value) as T;
  }

  /**
   * Updates a state key, emitting `stateChanged` (`{ key, value }`) if it changed.
   *
   * @param key The key
   * @param value The value
   * @returns `true` if it changed
   */
  updateState(key: string, value: unknown): boolean {
    if (isDeepStrictEqual(this.#state.get(key), value)) return false;
    this.#state.set(key, value);
    this.emitEvent(
      "stateChanged",
      { key, value },
      { multiple: (e: { key: string }) => e.key === key },
    );
    return true;
  }

  /**
   * Removes a state key, emitting `stateChanged` (`{ key, value: null }`) if it was set.
   *
   * @param key The key
   */
  removeState(key: string) {
    const wasSet = this.#state.get(key) !== undefined;
    this.#state.delete(key);
    if (wasSet) {
      this.emitEvent(
        "stateChanged",
        { key, value: null },
        { multiple: (e: { key: string }) => e.key === key },
      );
    }
  }

  /**
   * Logs a debug message (namespace `thing:<id>`).
   *
   * @param msgs The message parts
   */
  debug(...msgs: unknown[]) {
    this.#debug ??= createDebug(`thing:${this.id}`);
    this.#debug(...msgs);
  }

  /**
   * Runs a hook of every capability, in composition order.
   *
   * @internal
   * @param hook The hook
   * @param args Its arguments
   */
  async runCapabilityHooks(hook: CapabilityHook, ...args: unknown[]) {
    for (const fn of collect(this.constructor).hooks[hook]) {
      await fn.apply(this, args);
    }
  }

  /**
   * Runs a synchronous hook of every capability, in composition order.
   *
   * @internal
   * @param hook The hook
   * @param args Its arguments
   */
  runCapabilityHooksSync(hook: CapabilityHook, ...args: unknown[]) {
    for (const fn of collect(this.constructor).hooks[hook]) {
      fn.apply(this, args);
    }
  }
}
