import type { CommandBuilder } from "yargs";

import { log } from "../log.js";
import { deviceFinder } from "../device-finder.js";
import { stopGracefully } from "../stop.js";
import { tokens } from "../../lib/tokens.js";

export const command = "discover";
export const description = "Discover devices on the local network";
export const builder: CommandBuilder = {
  sync: {
    type: "boolean",
    description: "Synchronize tokens",
  },
};

/**
 * Lists the devices on the network until stopped (Ctrl+C), and saves the tokens they reveal with `--sync`.
 *
 * @param argv The parsed command line
 * @param argv.sync Whether to save the tokens
 */
export function handler(argv: { sync?: boolean }) {
  log.info("Discovering devices. Press Ctrl+C to stop.");
  log.plain();

  const browser = deviceFinder();
  // The tokens being saved, to wait for them before exiting
  const saving = new Set<Promise<void>>();
  stopGracefully(
    async () => {
      await Promise.allSettled(saving);
      await browser.destroy();
    },
    () => log.info("Stopping. Press Ctrl+C again to quit right away."),
  );

  browser.on("available", (device) => {
    try {
      log.device(device);
    } catch (ex) {
      log.error(ex);
    }

    const mgmt = device.management;
    const token = mgmt.token;
    if (
      argv.sync &&
      device.id &&
      token &&
      "autoToken" in mgmt &&
      mgmt.autoToken
    ) {
      const id = device.id;
      const save = async () => {
        try {
          await tokens.update(id, token);
        } catch (err) {
          log.error("Could not update token for", id, ":", err);
        }
      };
      const saved: Promise<void> = save().finally(() => saving.delete(saved));
      saving.add(saved);
    }
  });
}
