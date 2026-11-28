import type { CommandBuilder } from "yargs";

import { log } from "../../log.js";
import { runOnDevice } from "../../run_on_device.js";

export const command = "update <idOrIp>";
export const description = "Update the token to use for the given device";
export const builder: CommandBuilder = {
  token: {
    required: true,
    description: "The token to set",
  },
};

/**
 * Checks the new token works, and saves it.
 *
 * @param argv The parsed command line
 * @param argv.idOrIp The device
 * @param argv.token The token to set
 */
export function handler(argv: { idOrIp: string; token: string }) {
  log.info("Updating token for", argv.idOrIp);

  runOnDevice(
    // Connect with the new token: robots that hide theirs can't be reached without it
    {
      target: argv.idOrIp,
      token: argv.token,
      failure: "Could not update the token",
    },
    async (device) => {
      const mgmt = device.management;
      if (!("updateToken" in mgmt)) {
        throw new Error("Sub-devices use the token of their gateway");
      }
      log.plain();
      log.info("Connected to", device.id, " - trying to change token");
      log.plain();

      const status = await mgmt.updateToken(argv.token);
      if (status) {
        log.plain("Token has been updated");
      } else {
        log.error("Could not update token, double-check the given token");
        process.exitCode = 1;
      }
    },
  );
}
