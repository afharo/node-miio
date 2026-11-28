import util from "node:util";
import dns from "node:dns";
import EventEmitter from "node:events";

import { network } from "./network.js";
import { infoFromHostname } from "./info_from_hostname.js";
import {
  connectToDevice,
  type ConnectToDeviceOptions,
} from "./connect_to_device.js";
import { createDebug, type DebugFn } from "./logger.js";
import type { DeviceHandle } from "./management.js";
import type { DeviceInfo } from "./device_info.js";
import type { IDevice } from "./device.js";

/** Something a discovery finds: it only needs an id */
export interface Service {
  id: string;
}

/** Returned by `onAvailable`, `onUnavailable`… to stop listening */
export interface Subscription {
  unsubscribe(): void;
}

interface DiscoveryEvents<S> {
  available: [service: S];
  unavailable: [service: S];
  update: [service: S, previous: S];
  error: [error: Error];
}

/**
 * The services a discovery has found, and the events about them: `available`, `unavailable`, `update` (with the
 * previous registration) and `error`. Listen with `on("available", listener)` or `onAvailable(listener)`.
 *
 * (It replaced tinkerhub-discovery's `ServiceDiscovery`, keeping the parts node-miio uses.)
 */
export class ServiceDiscovery<S extends Service> extends EventEmitter<
  DiscoveryEvents<S>
> {
  protected readonly debug: DebugFn;
  readonly #services = new Map<string, S>();
  #destroyed = false;

  constructor(type: string) {
    super();
    this.debug = createDebug(`miio:discovery:${type}`);
  }

  /** The services that are available now */
  get services(): S[] {
    return Array.from(this.#services.values());
  }

  /**
   * @param id The id of a service
   * @returns The service, or `null` when it isn't available
   */
  get(id: string): S | null {
    return this.#services.get(id) ?? null;
  }

  /**
   * @param predicate Whether a service matches
   * @returns The first available service that matches, or `null`
   */
  find(predicate: (service: S) => boolean): S | null {
    return this.services.find(predicate) ?? null;
  }

  /**
   * @param predicate Whether a service matches
   * @returns The available services that match
   */
  findAll(predicate: (service: S) => boolean): S[] {
    return this.services.filter(predicate);
  }

  /**
   * @param listener Called with each service that becomes available
   * @returns A subscription, to stop listening
   */
  onAvailable(listener: (service: S) => void): Subscription {
    return this.#subscribe("available", listener);
  }

  /**
   * @param listener Called with each service that is no longer available
   * @returns A subscription, to stop listening
   */
  onUnavailable(listener: (service: S) => void): Subscription {
    return this.#subscribe("unavailable", listener);
  }

  /**
   * @param listener Called when an available service changes, with its previous registration
   * @returns A subscription, to stop listening
   */
  onUpdate(listener: (service: S, previous: S) => void): Subscription {
    return this.#subscribe("update", listener);
  }

  /**
   * @param listener Called when the discovery fails (e.g. a search, or connecting to a device)
   * @returns A subscription, to stop listening
   */
  onError(listener: (error: Error) => void): Subscription {
    return this.#subscribe("error", listener);
  }

  #subscribe<E extends keyof DiscoveryEvents<S>>(
    event: E,
    listener: (...args: DiscoveryEvents<S>[E]) => void,
  ): Subscription {
    // EventEmitter's typings can't narrow the listener of a generic event
    const typed = listener as never;
    this.on(event, typed);
    return { unsubscribe: () => this.off(event, typed) };
  }

  get destroyed() {
    return this.#destroyed;
  }

  /** Stops the discovery: no more events, and the resources it uses are released */
  async destroy(): Promise<void> {
    this.#destroyed = true;
  }

  /**
   * Whether a new registration of an available service is the same as the current one (then nothing is emitted).
   *
   * @param current The registration that is available
   * @param next The new registration
   * @returns `true` when they are the same
   */
  protected isSameService(current: S, next: S): boolean {
    return current === next;
  }

  /**
   * Adds a service, or updates it when it's already available.
   *
   * @param service The service found
   * @returns The previous registration, when it was replaced
   */
  protected updateService(service: S): S | null {
    if (!service?.id) throw new Error("Services must have an identifier");
    if (this.#destroyed) return null;

    const current = this.#services.get(service.id);
    this.#services.set(service.id, service);
    if (!current) {
      this.debug("Service", service.id, "is now available");
      this.emit("available", service);
      return null;
    }
    if (this.isSameService(current, service)) return null;
    this.debug("Service", service.id, "has been updated");
    this.emit("update", service, current);
    return current;
  }

  /**
   * Removes a service that is no longer available.
   *
   * @param service The service, or its id
   * @returns The registration removed, if it was available
   */
  protected removeService(service: S | string | undefined | null): S | null {
    if (service == null) return null;
    const id = typeof service === "string" ? service : service.id;
    const current = this.#services.get(id);
    if (!current) return null;
    this.#services.delete(id);
    this.debug("Service", id, "is no longer available");
    if (!this.#destroyed) this.emit("unavailable", current);
    return current;
  }

  /**
   * Emits an error, when someone listens (an `error` without listeners would throw).
   *
   * @param error What went wrong
   * @param message Context for the debug log
   */
  protected emitError(error: unknown, message: string) {
    this.debug(message, error);
    if (this.listenerCount("error") > 0 && !this.#destroyed) {
      this.emit(
        "error",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

export interface BrowserOptions {
  cacheTime?: number;
  tokens?: Record<string, string>;
}

/** How often the network is searched */
const SEARCH_INTERVAL_MS = 5000;

export interface BrowserService extends Service {
  address: string;
  port: number;
  token: string | Buffer | null;
  autoToken?: boolean;
  model?: string;
  hostname?: string;
  connect: (
    options?: Partial<ConnectToDeviceOptions>,
  ) => Promise<IDevice | undefined>;
}

/**
 * Finds the devices answering on the local network (without connecting to them). A device is unavailable once it
 * hasn't answered for `cacheTime` seconds.
 */
export class Browser extends ServiceDiscovery<BrowserService> {
  static get type() {
    return "miio";
  }

  private handle?: DeviceHandle["ref"];
  private readonly manualTokens: Record<string, string>;
  private readonly expirationTime: number;
  private readonly expirations = new Map<string, NodeJS.Timeout>();
  private searchInterval?: NodeJS.Timeout;

  constructor(options: BrowserOptions) {
    super(Browser.type);

    this.manualTokens = options.tokens || {};
    this.expirationTime = (options.cacheTime || 1800) * 1000;

    this.start();
  }

  _manualToken(id) {
    return this.manualTokens[id] || null;
  }

  start() {
    this.handle = network.ref();
    network.on("device", this.tryAdd);
    this.searchInterval = setInterval(() => {
      try {
        this.search();
      } catch (err) {
        this.emitError(err, "Caught error during search");
      }
    }, SEARCH_INTERVAL_MS);
  }

  async destroy() {
    clearInterval(this.searchInterval);
    for (const timer of this.expirations.values()) clearTimeout(timer);
    this.expirations.clear();
    await super.destroy();
    network.removeListener("device", this.tryAdd);
    this.handle?.release();
  }

  search() {
    network.search();
  }

  protected isSameService(current: BrowserService, next: BrowserService) {
    // `connect` is a new function for every registration: compare the data
    return (
      current === next ||
      (current.address === next.address &&
        current.port === next.port &&
        String(current.token) === String(next.token) &&
        current.autoToken === next.autoToken &&
        current.model === next.model &&
        current.hostname === next.hostname)
    );
  }

  protected updateService(service: BrowserService) {
    const previous = super.updateService(service);
    if (!this.destroyed) {
      // (Re)schedule the expiration of this service
      clearTimeout(this.expirations.get(service.id));
      this.expirations.set(
        service.id,
        setTimeout(() => this.removeService(service.id), this.expirationTime),
      );
    }
    return previous;
  }

  protected removeService(service: BrowserService | string | undefined | null) {
    const removed = super.removeService(service);
    if (removed) {
      clearTimeout(this.expirations.get(removed.id));
      this.expirations.delete(removed.id);
    }
    return removed;
  }

  private readonly tryAdd = (device: DeviceInfo) => {
    const service: BrowserService = {
      id: String(device.id),
      address: device.address,
      port: device.port as number,
      token: device.token || this._manualToken(device.id),
      autoToken: device.autoToken,

      connect: function (options: Partial<ConnectToDeviceOptions> = {}) {
        return connectToDevice({
          address: this.address,
          port: this.port,
          model: this.model,
          ...options,
        });
      },
    };

    const add = () => this.updateService(service);

    // Give us five seconds to try resolve some extras for new devices
    setTimeout(add, 5000);

    dns.lookupService(service.address, service.port, (err, hostname) => {
      if (err || !hostname) {
        add();
        return;
      }

      service.hostname = hostname;
      const info = infoFromHostname(hostname);
      if (info) {
        service.model = info.model;
      }

      add();
    });
  };

  [util.inspect.custom]() {
    return "MiioBrowser{}";
  }
}

export interface DevicesOptions extends BrowserOptions {
  token?: string | Buffer;
  filter?: (reg: { id: string; model: string; type: string }) => boolean;
  skipSubDevices?: boolean;
}

type DiscoveredDevice = IDevice & { id: string };

/**
 * Finds the devices on the local network, and connects to them (a placeholder when it can't). The sub-devices of
 * gateways are available too, unless `skipSubDevices` is set.
 */
export class Devices extends ServiceDiscovery<DiscoveredDevice> {
  static get type() {
    return "miio:devices";
  }

  private readonly _filter?: (reg: {
    id: string;
    model: string;
    type: string;
  }) => boolean;
  private readonly _skipSubDevices?: boolean;
  private readonly _browser: Browser;
  /** The connection attempt in progress for each registration of the browser, and the devices connected */
  private readonly connecting = new Map<string, object>();
  private readonly connected = new Map<string, DiscoveredDevice>();

  constructor(options: DevicesOptions) {
    super(Devices.type);

    this._filter = options.filter;
    this._skipSubDevices = options.skipSubDevices;

    this._browser = new Browser(options);
    this._browser.onAvailable((reg) => this.connect(reg, options.token));
    this._browser.onUnavailable((reg) => {
      this.connecting.delete(reg.id);
      const device = this.connected.get(reg.id);
      this.connected.delete(reg.id);
      if (device) this.removeService(device);
    });
  }

  private connect(reg: BrowserService, token: DevicesOptions["token"]) {
    if (this.connecting.has(reg.id) || this.connected.has(reg.id)) return;

    const attempt = {};
    this.connecting.set(reg.id, attempt);
    void (async () => {
      let device: IDevice | undefined;
      try {
        device = await connectToDevice({
          address: reg.address,
          port: reg.port,
          model: reg.model,
          withPlaceholder: true,
          token,
        });
      } catch (err) {
        if (this.connecting.get(reg.id) === attempt) {
          this.connecting.delete(reg.id);
        }
        this.emitError(err, `An error occurred connecting to ${reg.id}:`);
        return;
      }

      // It became unavailable (or was found again) meanwhile
      if (this.connecting.get(reg.id) !== attempt) return;
      this.connecting.delete(reg.id);
      if (!device) return;

      const discovered = device as DiscoveredDevice;
      this.connected.set(reg.id, discovered);
      this.updateService(discovered);

      // Capabilities are composed (not inherited): check the capability, not the class
      if (discovered.matches("cap:children")) {
        this._bindSubDevices(discovered);
      }
    })();
  }

  async destroy() {
    await super.destroy();
    this.connecting.clear();
    this.connected.clear();
    await this._browser.destroy();
  }

  [util.inspect.custom]() {
    return "MiioDevices{}";
  }

  _bindSubDevices(device) {
    if (this._skipSubDevices) return;

    const handleAvailable = (sub) => {
      if (!sub.miioModel) return;

      const reg = {
        id: sub.internalId,
        model: sub.model,
        type: sub.type,

        parent: device,
        device: sub,
      };

      if (this._filter && !this._filter(reg)) {
        // Filter does not match sub device
        return;
      }

      // Register and emit event
      this.updateService(sub);
    };

    device.on("thing:available", handleAvailable);
    device.on("thing:unavailable", (sub) => this.removeService(sub.id));

    // Register initial devices
    for (const child of device.children()) {
      handleAvailable(child);
    }
  }
}
