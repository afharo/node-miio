import util from "node:util";
import type { EventEmitter } from "node:events";

import isDeepEqual from "deep-equal";

import { MiioThing } from "../../things/thing";
import type { CallOptions, Device } from "../../device";
import type { Protocol } from "../../protocol";
import type { ActionDefinition } from "../../things/action_metadata";

const IDENTITY_MAPPER = <T>(v: T) => v;

/** What a sub-device needs from its gateway */
export interface SubDeviceParent {
  readonly id: string | null;
  /** The local developer API, which reports the properties of the sub-devices */
  devApi?: EventEmitter & { read(sid: string): void };
  call: Device["call"];
}

export interface SubDeviceInfo {
  id: string;
  model: string;
}

interface SubDevicePropertyDefinition {
  name?: string;
  mapper: (value: never) => unknown;
  /** Whether it's polled (default: `true`) */
  poll?: boolean;
}

class SubDeviceManagement {
  constructor(
    private readonly device: SubDevice,
    readonly parent: SubDeviceParent,
  ) {}

  get token() {
    return null;
  }

  get model() {
    return this.device.miioModel;
  }

  info() {
    return Promise.resolve({
      id: this.device.id,
      model: this.device.miioModel,
    });
  }
}

/**
 * A device connected to a gateway (Aqara sensors, switches…). Its properties are reported by the gateway's developer
 * API, and its calls are sent through the gateway (with its `sid`).
 */
export class SubDevice extends MiioThing {
  static actions: ActionDefinition[] = [
    {
      name: "call",
      description: "Calls a method of the sub-device (through the gateway)",
      arguments: [
        { type: "string", description: "The method" },
        { type: "array", description: "Its parameters" },
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
      name: "getProperties",
      description: "Several properties at once",
      arguments: [
        { type: "string[]", optional: true, description: "The properties" },
      ],
      returns: "object",
    },
  ];

  static get types() {
    return ["miio", "miio:subdevice"];
  }

  miioModel: string;
  /** The id without the `miio:` prefix */
  readonly internalId: string;
  readonly management: SubDeviceManagement;

  /** @internal */
  readonly _properties: Record<string, unknown> = {};
  /** @internal */
  readonly _propertiesToMonitor: string[] = [];
  /** @internal */
  readonly _propertyDefinitions: Record<string, SubDevicePropertyDefinition> =
    {};
  /** @internal */
  _currentRead: {
    promise?: Promise<Record<string, unknown>>;
    resolve?: () => void;
  } | null = null;

  constructor(
    protected readonly _parent: SubDeviceParent,
    info: SubDeviceInfo,
  ) {
    super();

    this.miioModel = info.model;
    this.id = info.id;
    this.internalId = info.id.substring(5);
    this.management = new SubDeviceManagement(this, _parent);

    // Bound, to be used as a listener of the developer API
    this._report = this._report.bind(this);

    Object.defineProperty(this, util.inspect.custom, {
      value: (
        depth: number,
        options: { stylize: (text: string, style: string) => string },
      ) => {
        const name = options.stylize("MiioDevice", "special");
        if (depth === 0) return `${name}[${this.miioModel}]`;
        return (
          `${name} {\n  model=${this.miioModel},\n` +
          `  types=${Array.from(this.metadata.types).join(", ")},\n` +
          `  capabilities=${Array.from(this.metadata.capabilities).join(", ")}\n}`
        );
      },
    });
  }

  async initCallback() {
    await super.initCallback();
    this._parent.devApi?.on(`properties:${this.internalId}`, this._report);
    await this.loadProperties();
  }

  async destroyCallback() {
    await super.destroyCallback();
    this._parent.devApi?.removeListener(
      `properties:${this.internalId}`,
      this._report,
    );
  }

  /**
   * Handles the properties reported by the developer API.
   *
   * @param data The reported properties
   */
  _report(data: Record<string, unknown>) {
    for (const key of this._propertiesToMonitor) {
      const value = data[key];
      if (value === undefined) continue;
      const def = this._propertyDefinitions[key];
      this.setProperty(
        def?.name ?? key,
        def ? def.mapper(value as never) : value,
      );
    }

    if (this._currentRead) {
      this._currentRead.resolve?.();
      this._currentRead = null;
    }
  }

  get properties() {
    return { ...this._properties };
  }

  property<T>(key: string): T {
    return this._properties[key] as T;
  }

  /**
   * Defines a property and how its value is mapped.
   *
   * @param name The raw property name
   * @param def How the value is mapped
   */
  defineProperty(
    name: string,
    def?:
      | ((value: never) => unknown)
      | (Partial<SubDevicePropertyDefinition> & {
          mapper?: (value: never) => unknown;
        }),
  ) {
    if (typeof def !== "object" || def.poll === undefined || def.poll) {
      this._propertiesToMonitor.push(name);
    }

    const definition: SubDevicePropertyDefinition =
      typeof def === "function"
        ? { mapper: def }
        : { ...def, mapper: def?.mapper ?? IDENTITY_MAPPER };
    this._propertyDefinitions[name] = definition;
  }

  setProperty(key: string, value: unknown) {
    const oldValue = this._properties[key];
    if (!isDeepEqual(oldValue, value)) {
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

  propertyUpdated(_key: string, _value: unknown, _oldValue?: unknown) {}

  getProperties(props: string[] = []) {
    return Object.fromEntries(props.map((key) => [key, this._properties[key]]));
  }

  /**
   * Reads the properties through the developer API, falling back to a regular call after a second.
   *
   * @param props The properties to return
   * @returns The properties
   */
  loadProperties(props?: string[]): Promise<Record<string, unknown>> {
    if (this._currentRead?.promise) return this._currentRead.promise;

    const currentRead: NonNullable<SubDevice["_currentRead"]> = {};
    this._currentRead = currentRead;
    currentRead.promise = new Promise((resolve, reject) => {
      currentRead.resolve = () => resolve(this.getProperties(props));
      this._parent.devApi?.read(this.internalId);

      // Fallback: a regular call if the properties haven't been reported in a second
      setTimeout(async () => {
        if (this._currentRead !== currentRead) return;
        this.debug("Read via DEV timed out, using fallback API");
        try {
          const result = (await this._parent.call("get_device_prop_exp", [
            ["lumi." + this.internalId, ...this._propertiesToMonitor],
          ])) as unknown[][];
          result[0].forEach((raw, i) => {
            const key = this._propertiesToMonitor[i];
            const def = this._propertyDefinitions[key];
            this.setProperty(
              def?.name ?? key,
              def ? def.mapper(raw as never) : raw,
            );
          });
          currentRead.resolve?.();
          this._currentRead = null;
        } catch (err) {
          this._currentRead = null;
          reject(err);
        }
      }, 1000);
    });

    return currentRead.promise;
  }

  /**
   * Calls a method of this sub-device (through the gateway).
   *
   * @param method The method
   * @param args Its arguments
   * @param options The call options
   * @returns The response
   */
  call<
    Method extends keyof Protocol,
    Params extends Protocol[Method]["params"],
    Response extends Protocol[Method]["response"],
  >(
    method: Method,
    args: Params,
    options: CallOptions = {},
  ): Promise<Response> {
    return this._parent.call<Method, Params, Response>(method, args, {
      ...options,
      sid: this.internalId,
    });
  }
}
