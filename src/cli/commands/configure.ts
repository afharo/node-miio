import type { CommandBuilder } from "yargs";

import { log } from "../log.js";
import { runOnDevice } from "../run_on_device.js";
import { tokens } from "../../lib/tokens.js";

export const command = "configure <idOrIp>";
export const description = "Connect a device to a Wi-Fi network";
export const builder: CommandBuilder = {
  token: {
    type: "string",
    description: "The known token of the device to communicate with",
  },

  ssid: {
    required: true,
    description: "SSID of the WiFi network",
    type: "string",
  },

  passwd: {
    required: true,
    description: "Password of WiFi-network",
    type: "string",
  },
};

/**
 * Connects the device to a Wi-Fi network, and saves its token.
 *
 * @param argv The parsed command line
 * @param argv.idOrIp The device
 * @param argv.ssid The network
 * @param argv.passwd Its password
 * @param argv.token The token, when it's not saved and the device hides it
 */
export function handler(argv: {
  idOrIp: string;
  ssid: string;
  passwd: string;
  token?: string;
}) {
  log.info("Attempting to configure", argv.idOrIp);

  runOnDevice(
    {
      target: argv.idOrIp,
      token: argv.token,
      failure: "Encountered an error while updating wireless",
    },
    async (device) => {
      const mgmt = device.management;
      if (!("updateWireless" in mgmt)) {
        throw new Error("Sub-devices are configured through their gateway");
      }
      log.plain();

      await mgmt.updateWireless({
        ssid: argv.ssid,
        passwd: argv.passwd,
      });
      log.plain("Updated wireless configuration");

      if (device.id && mgmt.token) {
        await tokens.update(device.id, mgmt.token);
      }
    },
  );
}
