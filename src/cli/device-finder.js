"use strict";

const { EventEmitter } = require("node:events");

const { Devices } = require("../lib/discovery");
const { connectToDevice } = require("../lib/connect_to_device");

const IP =
  /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

/**
 *
 * @param filter
 */
function asFilter(filter) {
  if (typeof filter === "number") {
    filter = String(filter);
  }

  if (typeof filter === "string") {
    return (reg) => {
      // Assign management if this filter is filtering a device
      const mgmt = reg.management ? reg.management : reg;

      // Make sure to remove `miio:` prefix from ids when matching
      let id = String(reg.id);
      if (id.indexOf("miio:") === 0) {
        id = id.substring(5);
      }

      // Match id, address or model
      return id === filter || mgmt.address === filter || mgmt.model === filter;
    };
  } else if (typeof filter === "function") {
    return filter;
  } else {
    return () => true;
  }
}

/**
 *
 * @param filter
 */
function asToplevelFilter(filter) {
  return (reg) => reg.type === "gateway" || filter(reg);
}

module.exports = function (options = {}) {
  const result = new EventEmitter();

  if (typeof options.filter === "string" && options.filter.match(IP)) {
    // IP-address specified
    connectToDevice({
      address: options.filter,
      withPlaceholder: true,
      token: options.token,
    })
      .then((device) => result.emit("available", device))
      .catch(() => result.emit("done"));
  } else {
    //
    const filter = asFilter(options.filter);
    const browser = new Devices({
      cacheTime: options.cacheTime || 300,
      filter: options.filter ? asToplevelFilter(filter) : undefined,
      token: options.token,
    });

    browser.onAvailable((device) => {
      if (filter(device)) {
        result.emit("available", device);
      }
    });
    browser.onUnavailable((device) => result.emit("unavailable", device));
  }
  return result;
};
