import type { CommandBuilder } from "yargs";

import { log } from "../../log.js";
import { parseCallParams } from "../../params.js";
import { runOnDevice } from "../../run_on_device.js";

export const command = "call <idOrIp> <method> [params...]";
export const description = "Call a raw method on a device";
export const builder: CommandBuilder = {
  token: {
    type: "string",
    description: "The known token of the device to communicate with",
  },
};

/**
 * Sends a miIO method to the device and prints its response.
 *
 * @param argv The parsed command line
 * @param argv.idOrIp The device
 * @param argv.method The miIO method, e.g. `get_status`
 * @param argv.params Its parameters (JSON, or plain strings)
 * @param argv.token The token, when it's not saved and the device hides it
 */
export function handler(argv: {
  idOrIp: string;
  method: string;
  params?: unknown;
  token?: string;
}) {
  log.info("Attempting to call", argv.method, "on", argv.idOrIp);

  runOnDevice(
    {
      target: argv.idOrIp,
      token: argv.token,
      failure: "Encountered an error while controlling device",
    },
    async (device) => {
      log.plain();
      log.info("Device found, making call");
      log.plain();

      const parsedArgs = parseCallParams(argv.params);
      log.plain(JSON.stringify(parsedArgs));
      // Any method can be called: the protocol's types only know some of them
      const method = argv.method as never;
      const result =
        "miioCall" in device
          ? await device.miioCall(method, parsedArgs as never)
          : await device.call(method, parsedArgs as never);
      log.info("Got result:");
      log.plain(JSON.stringify(result, null, "  "));
    },
  );
}
