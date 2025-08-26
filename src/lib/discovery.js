"use strict";

const util = require("node:util");
const dns = require("node:dns");

const {
  TimedServiceDiscovery,
  BasicServiceDiscovery,
} = require("tinkerhub-discovery");
const { Children } = require("abstract-things");

const network = require("./network");
const infoFromHostname = require("./infoFromHostname");
const connectToDevice = require("./connectToDevice");

const tryAdd = Symbol("tryAdd");

const Browser = (module.exports.Browser = class Browser extends (
  TimedServiceDiscovery
) {
  static get type() {
    return "miio";
  }

  constructor(options) {
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

  destroy() {
    return super.destroy().then(() => {
      network.removeListener("device", this[tryAdd]);
      this.handle.release();
    });
  }

  search() {
    network.search();
  }

  [tryAdd](device) {
    const service = {
      id: device.id,
      address: device.address,
      port: device.port,
      token: device.token || this._manualToken(device.id),
      autoToken: device.autoToken,

      connect: function (options = {}) {
        return connectToDevice(
          Object.assign(
            {
              address: this.address,
              port: this.port,
              model: this.model,
            },
            options,
          ),
        );
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
});

class Devices extends BasicServiceDiscovery {
  static get type() {
    return "miio:devices";
  }

  constructor(options) {
    super(Devices.type);

    this._filter = options && options.filter;
    this._skipSubDevices = options && options.skipSubDevices;

    this._browser = new Browser(options).map((reg) => {
      return connectToDevice({
        address: reg.address,
        port: reg.port,
        model: reg.model,
        withPlaceholder: true,
        token: options.token,
      });
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

module.exports.Devices = Devices;
