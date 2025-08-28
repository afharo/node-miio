"use strict";

import util from "node:util";

import isDeepEqual from "deep-equal";
import { Thing, Polling } from "abstract-things";

import { type DeviceHandle, DeviceManagement } from "./management";
import type { Protocol } from "./protocol";

const IDENTITY_MAPPER = <T>(v: T) => v;

type Mapper<T, V> = (input: T) => V;

interface PropertyDefinition<T, V> {
  name: string;
  mapper: Mapper<T, V>;
  handler?: (result: Record<string, unknown>, value: unknown) => void;
}

export const MiioApi = Thing.type(
  (Parent) =>
    class extends Parent.with(Polling) {
      static get type() {
        return "miio";
      }

      static availableAPI(builder) {
        builder
          .action("miioModel")
          .description("Get the model identifier of this device")
          .returns("string")
          .done();

        builder
          .action("miioProperties")
          .description("Get properties of this device")
          .returns("string")
          .done();

        builder
          .action("miioCall")
          .description("Execute a raw miio-command to the device")
          .argument("string", false, "The command to run")
          .argument("array", true, "Arguments of the command")
          .done();
      }

      public readonly id: string;
      public readonly miioModel?: string;
      private readonly _properties: Record<string, unknown> = {};
      private readonly _propertiesToMonitor: string[] = [];
      private readonly _propertyDefinitions: Record<
        string,
        PropertyDefinition<never, never>
      > = {};
      private readonly _reversePropertyDefinitions: Record<string, string>;

      constructor(public readonly handle: DeviceHandle) {
        super();

        this.handle = handle;
        this.id = "miio:" + handle.api.id;
        this.miioModel = handle.api.model;

        this._properties = {};
        this._propertiesToMonitor = [];
        this._propertyDefinitions = {};
        this._reversePropertyDefinitions = {};

        this.poll = this.poll.bind(this);
        // Set up polling to destroy device if unreachable for 5 minutes
        this.updateMaxPollFailures(10);

        this.management = new DeviceManagement(this);
      }

      /**
       * Public API: Call a miio method.
       *
       * @param {string} method
       * @param {*} args
       */
      miioCall<Method extends keyof Protocol, Params extends Protocol[Method]>(
        method: Method,
        args: Params,
      ) {
        return this.call(method, args);
      }

      /**
       * Call a raw method on the device.
       *
       * @param {*} method
       * @param {*} args
       * @param {*} options
       * @param options.refresh
       * @param options.refreshDelay
       * @param options.sid
       * @param options.retries
       */
      async call<
        Method extends keyof Protocol,
        Params extends Protocol[Method],
      >(
        method: Method,
        args: Params,
        options?: {
          refresh?: string[];
          refreshDelay?: number;
          sid?: number;
          retries?: number;
        },
      ) {
        const res = await this.handle.api.call(method, args, options);
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
      defineProperty<T, V>(
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
        this._propertyDefinitions[name] = def as unknown as PropertyDefinition<
          never,
          never
        >;
      }

      /**
       * Map and add a property to an object.
       *
       * @param {object} result
       * @param {string} name
       * @param {*} value
       */
      _pushProperty(
        result: Record<string, unknown>,
        name: string,
        value: unknown,
      ) {
        const def = this._propertyDefinitions[name];
        if (!def) {
          result[name] = value;
        } else if (def.handler) {
          def.handler(result, value);
        } else {
          result[def.name || name] = def.mapper(value as never);
        }
      }

      poll(_isInitial: boolean = false) {
        // Polling involves simply calling load properties
        return this._loadProperties();
      }

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

      setProperty(key: string, value: unknown) {
        const oldValue = this._properties[key];

        if (!isDeepEqual(oldValue, value)) {
          this._properties[key] = value;
          this.debug("Property", key, "changed from", oldValue, "to", value);

          this.propertyUpdated(key, value, oldValue);
        }
      }

      propertyUpdated(_key: string, _value: unknown, _oldValue: unknown) {}

      setRawProperty(name: string, value: unknown) {
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

      property<T>(key: string): T {
        return this._properties[key] as T;
      }

      get properties() {
        return Object.assign({}, this._properties);
      }

      /**
       * Public API to get properties defined by the device.
       */
      miioProperties() {
        return this.properties;
      }

      /**
       * Get several properties at once.
       *
       * @param {Array} props
       */
      getProperties(props: string[]) {
        const result = {};
        props.forEach((key) => {
          result[key] = this._properties[key];
        });
        return result;
      }

      /**
       * Load properties from the device.
       *
       * @param {*} props
       */
      async loadProperties(props: string[]) {
        // Rewrite property names to device internal ones
        props = props.map(
          (key) => this._reversePropertyDefinitions[key] || key,
        );

        // Call get_prop to map everything
        const result = await this.call("get_prop", props);
        const obj = {};
        for (let i = 0; i < result.length; i++) {
          this._pushProperty(obj, props[i], result[i]);
        }
        return obj;
      }

      /**
       * Callback for performing destroy tasks for this device.
       */
      async destroyCallback() {
        await super.destroyCallback();
        // Release the reference to the network
        this.handle.ref.release();
      }

      [util.inspect.custom](depth, options) {
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
    },
);

export const Device = MiioApi;

export default MiioApi;
