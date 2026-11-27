"use strict";

import util from "node:util";

import { isSameValue } from "./same_value";
import { type DeviceHandle, DeviceManagement } from "./management";
import { createDebug, type DebugFn } from "./logger";
import { MiioThing } from "./things/thing";
import { duration } from "./things/values";
import type { Protocol } from "./protocol";
import type { ActionDefinition } from "./things/action_metadata";

const IDENTITY_MAPPER = <T>(v: T) => v;

export type Mapper<T, V> = (input: T) => V;

export interface PropertyDefinition<T, V> {
  name: string;
  siid?: number;
  piid?: number;
  mapper?: Mapper<T, V>;
  handler?: (result: Record<string, unknown>, value: unknown) => void;
}

export type PersistedPropertyDefinition<T, V> = PropertyDefinition<T, V> & {
  mapper: Mapper<T, V>;
};

const POLL_DURATION = 30_000;

export interface CallOptions {
  /** Properties to reload after the call (`true`: all the monitored ones) */
  refresh?: string[] | true;
  refreshDelay?: number;
  sid?: number | string;
  retries?: number;
}

/**
 * Base of the miIO devices: properties (`defineProperty` / `loadProperties`), raw calls (`call`) and polling.
 *
 * Capabilities are added with `compose(MiioDevice, ...)`. Capabilities can react to property changes with the
 * `capabilityPropertyUpdated(key, value, oldValue)` hook.
 */
export class Device extends MiioThing {
  static actions: ActionDefinition[] = [
    {
      name: "miioCall",
      description: "Calls a miIO method (see protocol call)",
      arguments: [
        { type: "string", description: "The method" },
        { type: "array", optional: true, description: "Its parameters" },
      ],
    },
    {
      name: "call",
      description: "Calls a miIO method, with options (refresh…)",
      arguments: [
        { type: "string", description: "The method" },
        { type: "array", optional: true, description: "Its parameters" },
        {
          type: "object",
          optional: true,
          description: "Options: { refresh, refreshDelay, retries }",
        },
      ],
    },
    {
      name: "property",
      description: "The value of a property",
      arguments: [{ type: "string", description: "The property" }],
    },
    {
      name: "miioProperties",
      description: "All the properties",
      returns: "object",
    },
    {
      name: "getProperties",
      description: "Several properties at once",
      arguments: [{ type: "string[]", description: "The properties" }],
      returns: "object",
    },
  ];

  static get type() {
    return "miio";
  }

  public readonly miioModel?: string;
  /** @internal */
  readonly _properties: Record<string, unknown> = {};
  /** @internal */
  readonly _propertiesToMonitor: string[] = [];
  /** @internal */
  readonly _propertyDefinitions: Record<
    string,
    PersistedPropertyDefinition<never, never>
  > = {};
  /** @internal */
  readonly _reversePropertyDefinitions: Record<string, string>;
  /** @internal */
  readonly management: DeviceManagement;
  /** @internal */
  debugFn?: DebugFn;

  /**
   * Logs a debug message to the `debug` package (`thing:<id>`) and to the device's logger (`device({ logger })`).
   *
   * @param msgs The message parts
   */
  debug(...msgs: unknown[]) {
    this.debugFn ??= createDebug(
      "thing:" + this.id,
      () => this.handle.api.logger,
    );
    this.debugFn(...msgs);
  }

  constructor(public readonly handle: DeviceHandle) {
    super();

    this.handle = handle;
    this.id = "miio:" + handle.api.id;
    this.miioModel = handle.api.model;

    this._properties = {};
    this._propertiesToMonitor = [];
    this._propertyDefinitions = {};
    this._reversePropertyDefinitions = {};

    // Destroy the device if it's unreachable for 5 minutes
    this.updateMaxPollFailures(10);

    this.management = new DeviceManagement(this);

    // Not a `[util.inspect.custom]()` method: a computed method can't be named in the published types
    Object.defineProperty(this, util.inspect.custom, {
      value: (
        depth: number,
        options: { stylize: (text: string, style: string) => string },
      ) => {
        if (depth === 0) {
          return (
            options.stylize("MiioDevice", "special") +
            "[" +
            this.miioModel +
            "]"
          );
        }

        return (
          options.stylize("MiioDevice", "special") +
          " {\n" +
          "  model=" +
          this.miioModel +
          ",\n" +
          "  types=" +
          Array.from(this.metadata.types).join(", ") +
          ",\n" +
          "  capabilities=" +
          Array.from(this.metadata.capabilities).join(", ") +
          "\n}"
        );
      },
    });
  }

  /**
   * Public API: Call a miio method.
   *
   * @param method
   * @param args
   */
  public miioCall<
    Method extends keyof Protocol,
    Params extends Protocol[Method]["params"],
    Response extends Protocol[Method]["response"],
  >(method: Method, args: Params): Promise<Response> {
    return this.call<Method, Params, Response>(method, args);
  }

  /**
   * Call a raw method on the device.
   *
   * @param method
   * @param args
   * @param options
   * @param options.refresh
   * @param options.refreshDelay
   * @param options.sid
   * @param options.retries
   */
  public async call<
    Method extends keyof Protocol,
    Params extends Protocol[Method]["params"],
    Response extends Protocol[Method]["response"],
  >(method: Method, args: Params, options?: CallOptions): Promise<Response> {
    const res = await this.handle.api.call<Method, Params, Response>(
      method,
      args,
      options,
    );
    if (options && options.refresh) {
      // Special case for loading properties after setting values
      // - delay a bit to make sure the device has time to respond
      await new Promise<void>((resolve) =>
        setTimeout(resolve, (options && options.refreshDelay) || 50),
      );
      const properties = Array.isArray(options.refresh)
        ? options.refresh
        : this._propertiesToMonitor;

      await this._loadProperties(properties).catch(() => {});
    }
    return res;
  }

  /**
   * Define a property and how the value should be mapped. All defined
   * properties are monitored if #monitor() is called.
   *
   * @param name
   * @param def
   */
  public defineProperty<T, V>(
    name: string,
    def?: Mapper<T, V> | PropertyDefinition<T, V>,
  ) {
    this._propertiesToMonitor.push(name);

    if (typeof def === "function") {
      def = {
        name,
        mapper: def,
      };
    } else if (typeof def === "undefined") {
      def = {
        name,
        mapper: IDENTITY_MAPPER as Mapper<T, V>,
      };
    }

    if (typeof def === "object" && !def.mapper) {
      def.mapper = IDENTITY_MAPPER as Mapper<T, V>;
    }

    if (def.name) {
      this._reversePropertyDefinitions[def.name] = name;
    }
    this._propertyDefinitions[name] =
      def as unknown as PersistedPropertyDefinition<never, never>;
  }

  /**
   * Map and add a property to an object.
   *
   * @param result
   * @param name
   * @param value
   */
  _pushProperty(result: Record<string, unknown>, name: string, value: unknown) {
    const def = this._propertyDefinitions[name];
    if (!def) {
      result[name] = value;
    } else if (def.handler) {
      def.handler(result, value);
    } else {
      result[def.name || name] = def.mapper(value as never);
    }
  }

  public poll(_isInitial: boolean = false) {
    // Polling involves simply calling load properties
    return this._loadProperties();
  }

  /**
   * Loads the properties from the device.
   *
   * @internal
   * @param properties The properties to load (default: the monitored ones)
   */
  async _loadProperties(properties?: string[]) {
    if (typeof properties === "undefined") {
      properties = this._propertiesToMonitor;
    }

    if (properties.length === 0) return Promise.resolve();

    const values = await this.loadProperties(properties);
    Object.keys(values).forEach((key) => {
      this.setProperty(key, values[key]);
    });
  }

  public setProperty(key: string, value: unknown) {
    const oldValue = this._properties[key];

    if (!isSameValue(oldValue, value)) {
      this._properties[key] = value;
      this.debug("Property", key, "changed from", oldValue, "to", value);

      this.propertyUpdated(key, value, oldValue);
      this.runCapabilityHooksSync(
        "capabilityPropertyUpdated",
        key,
        value,
        oldValue,
      );
    }
  }

  public propertyUpdated(_key: string, _value: unknown, _oldValue?: unknown) {}

  public setRawProperty(name: string, value: unknown) {
    const def = this._propertyDefinitions[name];
    if (!def) return;

    if (def.handler) {
      const result = {};
      def.handler(result, value);
      Object.keys(result).forEach((key) => {
        this.setProperty(key, result[key]);
      });
    } else {
      this.setProperty(def.name || name, def.mapper(value as never));
    }
  }

  public property<T>(key: string): T {
    return this._properties[key] as T;
  }

  /**
   * Whether the device can still be used: `false` once it (and every other device sharing the network socket) has
   * been destroyed. Connect again with `device()` in that case.
   */
  get connected(): boolean {
    return this.handle.api.connected;
  }

  get properties() {
    return Object.assign({}, this._properties);
  }

  /**
   * Public API to get properties defined by the device.
   */
  public miioProperties() {
    return this.properties;
  }

  /**
   * Get several properties at once.
   *
   * @param props
   */
  public getProperties(props: string[]) {
    const result = {};
    props.forEach((key) => {
      result[key] = this._properties[key];
    });
    return result;
  }

  /**
   * Load properties from the device.
   *
   * @param props
   */
  public async loadProperties(props: string[]) {
    // Rewrite property names to device internal ones
    props = props.map((key) => this._reversePropertyDefinitions[key] || key);

    // Call get_prop to map everything
    const result = await this.call("get_prop", props);
    const obj = {};
    for (let i = 0; i < result.length; i++) {
      this._pushProperty(obj, props[i], result[i]);
    }
    return obj;
  }

  /** @internal */
  _pollDuration = POLL_DURATION;
  /** @internal */
  _maxPollFailures = -1;
  /** @internal */
  _pollFailures = 0;
  /** @internal */
  _pollTimer?: NodeJS.Timeout;

  /**
   * Changes how often the device is polled.
   *
   * @param time The time between polls (milliseconds, or e.g. `"30s"`)
   */
  public updatePollDuration(time: number | string) {
    this._pollDuration = duration(time).ms;
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = setTimeout(
        () => this.internalPoll(),
        this._pollDuration,
      );
    }
  }

  /**
   * Destroys the device after this many failed polls in a row (`-1`: never).
   *
   * @param failures The number of failures
   */
  public updateMaxPollFailures(failures: number) {
    this._maxPollFailures = failures;
  }

  public async initCallback() {
    await super.initCallback();
    // A single poll is performed during the initialization
    await this.internalPoll(true);
  }

  /**
   * Polls the device and schedules the next poll.
   *
   * @internal
   * @param isInitial Whether it's the poll of the initialization
   */
  async internalPoll(isInitial = false) {
    const start = Date.now();
    let failed = false;
    try {
      await this.poll(isInitial);
    } catch (err) {
      this.debug("Could not poll:", err);
      failed = true;
    }

    if (failed) {
      this._pollFailures++;
      if (
        this._maxPollFailures > 0 &&
        this._maxPollFailures <= this._pollFailures
      ) {
        // Too many failures in a row: the device is gone
        void this.destroy();
      }
    } else {
      this._pollFailures = 0;
    }

    // Schedule the next poll, keeping the period
    const d = this._pollDuration;
    let next = d - (Date.now() - start);
    while (next < 0) next += d;
    this._pollTimer = setTimeout(() => this.internalPoll(), next);
  }

  /**
   * Callback for performing destroy tasks for this device.
   */
  public async destroyCallback() {
    await super.destroyCallback();
    clearTimeout(this._pollTimer);
    // Release the reference to the network
    this.handle.ref.release();
  }
  /**
   * Check that the current result is equal to the string `ok`.
   *
   * @param result
   */
  static checkOk(result: unknown) {
    if (
      !result ||
      (typeof result === "string" && result.toLowerCase() !== "ok")
    ) {
      throw new Error("Could not perform operation");
    }

    return null;
  }
}

/** Any device (the base class: narrow it with `instanceof` or `isVacuum`) */
export type IDevice = Device;

// In some places, it's imported as Device, in some others, it's MiioApi
export { Device as MiioApi };
