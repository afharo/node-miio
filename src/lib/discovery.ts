import util from "node:util";
import dns from "node:dns";

import {
  TimedServiceDiscovery,
  BasicServiceDiscovery,
  type ServiceDiscovery,
  type Service,
} from "tinkerhub-discovery";
import { Children } from "abstract-things";

import { network } from "./network";
import { infoFromHostname } from "./info_from_hostname";
import {
  connectToDevice,
  type ConnectToDeviceOptions,
} from "./connect_to_device";
import type { DeviceHandle } from "./management";
import type { DeviceInfo } from "./device_info";
import type { IDevice } from "./device";

const tryAdd = Symbol("tryAdd");

export interface BrowserOptions {
  cacheTime?: number;
  tokens?: Record<string, string>;
}

interface BrowserService extends Service {
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

export class Browser extends TimedServiceDiscovery<BrowserService> {
  static get type() {
    return "miio";
  }

  private handle?: DeviceHandle["ref"];
  private readonly manualTokens: Record<string, string>;

  constructor(options: BrowserOptions) {
    super(Browser.type, {
      expirationTime: (options.cacheTime || 1800) * 1000,
      searchTime: 5000,
    });

    this.manualTokens = options.tokens || {};
    this[tryAdd] = this[tryAdd].bind(this);

    this.start();
  }

  _manualToken(id) {
    return this.manualTokens[id] || null;
  }

  start() {
    this.handle = network.ref();
    network.on("device", this[tryAdd]);
  }

  async destroy() {
    await super.destroy();
    network.removeListener("device", this[tryAdd]);
    this.handle?.release();
  }

  search() {
    network.search();
  }

  [tryAdd](device: DeviceInfo) {
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
  }

  [util.inspect.custom]() {
    return "MiioBrowser{}";
  }
}

export interface DevicesOptions extends BrowserOptions {
  token?: string | Buffer;
  filter?: (reg: { id: string; model: string; type: string }) => boolean;
  skipSubDevices?: boolean;
}

export class Devices extends BasicServiceDiscovery<IDevice & { id: string }> {
  static get type() {
    return "miio:devices";
  }

  private readonly _filter?: (reg: {
    id: string;
    model: string;
    type: string;
  }) => boolean;
  private readonly _skipSubDevices?: boolean;
  private readonly _browser: ServiceDiscovery<IDevice & { id: string }>;

  constructor(options: DevicesOptions) {
    super(Devices.type);

    this._filter = options.filter;
    this._skipSubDevices = options.skipSubDevices;

    this._browser = new Browser(options).map((reg) => {
      return connectToDevice({
        address: reg.address,
        port: reg.port,
        model: reg.model,
        withPlaceholder: true,
        token: options.token,
      }) as Promise<IDevice & { id: string }>;
    });

    this._browser.onAvailable((s) => {
      this.updateService(s);

      if (s instanceof Children) {
        this._bindSubDevices(s);
      }
    });

    this._browser.onUnavailable((s) => {
      this.removeService(s);
    });
  }

  destroy() {
    return super.destroy().then(() => this._browser.destroy());
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
