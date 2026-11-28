import { log } from "./log.js";
import { deviceFinder, type FoundDevice } from "./device-finder.js";

/** How long to wait for the device, when it's searched on the network */
const SEARCH_TIMEOUT_MS = 5000;

export interface RunOnDeviceOptions {
  /** The device: its IP address, id or model */
  target: string;
  /** The token given on the command line */
  token?: string;
  /** The error message when the action fails, e.g. "Could not inspect the device" */
  failure: string;
}

/**
 * Runs a command on one device, then exits: with code 1 when the device can't be found (in 5 seconds) or the action
 * throws (it's logged with `failure`).
 *
 * @param options The options
 * @param action What to do with the device. Set `process.exitCode` to fail without throwing.
 */
export function runOnDevice(
  options: RunOnDeviceOptions,
  action: (device: FoundDevice) => Promise<void>,
) {
  let foundDevice = false;
  let pending = 0;
  const browser = deviceFinder({
    filter: options.target,
    token: options.token,
  });

  browser.on("available", async (device) => {
    pending++;
    foundDevice = true;

    try {
      await action(device);
    } catch (err) {
      process.exitCode = 1;
      log.error(
        `${options.failure}:`,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      pending--;
      process.exit(); // eslint-disable-line n/no-process-exit
    }
  });

  const doneHandler = () => {
    if (pending === 0) {
      if (!foundDevice) {
        log.warn("Could not find device");
        process.exitCode = 1;
      }
      process.exit(); // eslint-disable-line n/no-process-exit
    }
  };
  setTimeout(doneHandler, SEARCH_TIMEOUT_MS);
  browser.on("done", doneHandler);
}
