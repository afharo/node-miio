import { EventEmitter } from "node:events";

import { Devices } from "../lib/discovery.js";
import { connectToDevice } from "../lib/connect_to_device.js";
import { Placeholder } from "../lib/placeholder.js";
import { tokens } from "../lib/tokens.js";
import type { Device } from "../lib/device.js";
import type { SubDevice } from "../lib/devices/gateway/subdevice.js";

const IP =
  /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

/** A device the finder found: a connected device, a placeholder (it hides its token), or a gateway's sub-device */
export type FoundDevice = Device | SubDevice;

/** What a filter matches: a found device, or a registration of the discovery */
interface FilterTarget {
  id?: string | null;
  type?: string;
  address?: string;
  model?: string;
  management?: { address?: string; model?: string };
}

type Filter = (target: FilterTarget) => boolean;

export interface DeviceFinderOptions {
  /** The device id, IP address or model, or a filter function. All the devices when not set. */
  filter?: string | number | Filter;
  /** The token given on the command line */
  token?: string;
  /** How long (in seconds) a device that stopped answering is kept. Default: 300 */
  cacheTime?: number;
}

/** Emits `available` and `unavailable` (with the device), and `done` when the device given by IP can't be reached */
export interface DeviceFinder
  extends EventEmitter<{
    available: [device: FoundDevice];
    unavailable: [device: FoundDevice];
    done: [];
  }> {
  /** Stops the discovery and closes the network socket */
  destroy(): Promise<void>;
}

/**
 * Connects again with the saved token when the device couldn't be reached without one (it hides its token).
 *
 * @param device The device, or a placeholder
 * @param token The token given on the command line: it wins over the saved one
 * @returns The connected device, or the same one
 */
export async function withSavedToken<D extends { id: string | null }>(
  device: D,
  token?: string,
): Promise<D | Device> {
  if (token || !(device instanceof Placeholder)) return device;
  const id = String(device.id).replace(/^miio:/, "");
  const saved = await tokens.get(id).catch(() => undefined);
  if (!saved) return device;
  try {
    return (
      (await connectToDevice({
        address: device.management.address,
        port: device.management.port,
        token: saved,
      })) ?? device
    );
  } catch {
    return device;
  }
}

/**
 * Converts a device id, IP or model into a filter function.
 *
 * @param filter The id, address or filter function
 * @returns The filter function
 */
function asFilter(filter: DeviceFinderOptions["filter"]): Filter {
  if (typeof filter === "number") {
    filter = String(filter);
  }

  if (typeof filter === "string") {
    const wanted = filter;
    return (reg) => {
      // Assign management if this filter is filtering a device
      const mgmt = reg.management ? reg.management : reg;

      // Make sure to remove `miio:` prefix from ids when matching
      const id = String(reg.id).replace(/^miio:/, "");

      // Match id, address or model
      return id === wanted || mgmt.address === wanted || mgmt.model === wanted;
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
 * @param filter The filter function
 * @returns The filter function, that also matches gateways
 */
function asToplevelFilter(filter: Filter): Filter {
  return (reg) => reg.type === "gateway" || filter(reg);
}

/**
 * Finds the devices for a CLI command: the one at an IP address (connected directly), or the ones on the network that
 * match the filter.
 *
 * @param options The options
 * @returns The finder
 */
export function deviceFinder(options: DeviceFinderOptions = {}): DeviceFinder {
  const result = new EventEmitter() as DeviceFinder;
  result.destroy = async () => {};

  if (typeof options.filter === "string" && options.filter.match(IP)) {
    // IP-address specified
    connectToDevice({
      address: options.filter,
      withPlaceholder: true,
      token: options.token,
    })
      .then((device) => {
        if (!device) throw new Error("Not found");
        return withSavedToken(device, options.token);
      })
      .then((device) => result.emit("available", device))
      .catch(() => result.emit("done"));
  } else {
    const filter = asFilter(options.filter);
    const browser = new Devices({
      cacheTime: options.cacheTime || 300,
      filter: options.filter ? asToplevelFilter(filter) : undefined,
      token: options.token,
    });

    browser.onAvailable(async (device) => {
      if (filter(device as FilterTarget)) {
        result.emit("available", await withSavedToken(device, options.token));
      }
    });
    browser.onUnavailable((device) => result.emit("unavailable", device));
    // Stops the discovery and closes the network socket
    result.destroy = () => browser.destroy();
  }
  return result;
}
