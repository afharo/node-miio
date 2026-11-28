import type { CommandBuilder } from "yargs";

import { log } from "../log.js";
import { parseArgs } from "../params.js";
import { runOnDevice } from "../run_on_device.js";

export const command = "control <idOrIp> <method> [params..]";
export const description = "Control a device by invoking the given method";
export const builder: CommandBuilder = {
  token: {
    type: "string",
    description: "The known token of the device to communicate with",
  },
};

/**
 * Calls a method of the device (one of the actions `inspect` lists) and prints what it returns.
 *
 * @param argv The parsed command line
 * @param argv.idOrIp The device
 * @param argv.method The method
 * @param argv.params Its arguments (JSON, or plain strings)
 * @param argv.token The token, when it's not saved and the device hides it
 */
export function handler(argv: {
  idOrIp: string;
  method: string;
  params?: unknown;
  token?: string;
}) {
  log.info("Attempting to invoke", argv.method, "on", argv.idOrIp);

  runOnDevice(
    {
      target: argv.idOrIp,
      token: argv.token,
      failure: "Encountered an error while controlling device",
    },
    async (device) => {
      const method = (device as unknown as Record<string, unknown>)[
        argv.method
      ];
      if (typeof method !== "function") {
        log.error("The method " + argv.method + " is not available");
        process.exitCode = 1;
        return;
      }

      const result = await method.apply(device, parseArgs(argv.params));
      // Methods that change something return nothing: the "Done" line says it worked
      if (result !== undefined) {
        log.plain(JSON.stringify(result, null, "  "));
      }
    },
  );
}
