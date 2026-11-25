"use strict";

const { EventEmitter } = require("node:events");

const { Devices } = require("../lib/discovery");
const { connectToDevice } = require("../lib/connect_to_device");
const { Placeholder } = require("../lib/placeholder");
const { tokens } = require("../lib/tokens");

const IP =
  /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

/**
 * Connects again with the saved token when the device couldn't be reached without one (it hides its token).
 *
 * @param {object} device The device, or a placeholder
 * @param {string|Buffer} [token] The token given on the command line: it wins over the saved one
 * @returns {Promise<object>} The connected device, or the same one
 */
async function withSavedToken(device, token) {
  if (token || !(device instanceof Placeholder)) return device;
  const id = String(device.id).replace(/^miio:/, "");
  const saved = await tokens.get(id).catch(() => undefined);
  if (!saved) return device;
  try {
    return await connectToDevice({
      address: device.management.address,
      port: device.management.port,
      token: saved,
    });
  } catch {
    return device;
  }
}

/**
 * Converts a device id, IP or model into a filter function.
 *
 * @param {string|number|Function} filter The id, address or filter function
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
 * Wraps a filter so gateways are always included (to find their sub devices).
 *
 * @param {Function} filter The filter function
 */
function asToplevelFilter(filter) {
  return (reg) => reg.type === "gateway" || filter(reg);
}

module.exports = function deviceFinder(options = {}) {
  const result = new EventEmitter();
  result.destroy = async () => {};

  if (typeof options.filter === "string" && options.filter.match(IP)) {
    // IP-address specified
    connectToDevice({
      address: options.filter,
      withPlaceholder: true,
      token: options.token,
    })
      .then((device) => withSavedToken(device, options.token))
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

    browser.onAvailable(async (device) => {
      if (filter(device)) {
        result.emit("available", await withSavedToken(device, options.token));
      }
    });
    browser.onUnavailable((device) => result.emit("unavailable", device));
    // Stops the discovery and closes the network socket
    result.destroy = () => browser.destroy();
  }
  return result;
};

module.exports.withSavedToken = withSavedToken;
