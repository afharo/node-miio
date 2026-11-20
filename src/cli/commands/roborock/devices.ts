import type { CommandBuilder } from "yargs";

import { maskToken } from "../../../lib/logger";
import {
  loadRoborockSession,
  RoborockError,
  RoborockSessionExpiredError,
  RoborockWebApi,
} from "../../../lib/roborock/index";
import { log } from "../../log";

export const command = "devices";
export const description =
  "List the robots of your Roborock account, with their model and protocol version";
export const builder: CommandBuilder = {
  json: { type: "boolean", description: "Print the robots as JSON" },
  "show-keys": {
    type: "boolean",
    description:
      "Show the local keys in full (they are as sensitive as a password)",
  },
};

export const handler = async (argv: { json?: boolean; showKeys?: boolean }) => {
  const session = await loadRoborockSession();
  if (!session) {
    log.error("Not logged in. Run: node-miio roborock login");
    process.exitCode = 1;
    return;
  }
  try {
    const devices = (await new RoborockWebApi(session).getDevices()).map(
      (device) => ({
        ...device,
        localKey: argv.showKeys ? device.localKey : maskToken(device.localKey),
      }),
    );

    if (argv.json) {
      console.log(JSON.stringify(devices, null, 2));
      return;
    }
    if (devices.length === 0) {
      log.info("No robots found in this account.");
      return;
    }
    for (const device of devices) {
      log.plain(`${device.name}${device.shared ? " (shared with you)" : ""}`);
      log.plain(
        `  Model:     ${device.model ?? "-"} (${device.productName ?? "?"})`,
      );
      log.plain(`  Protocol:  ${device.protocolVersion}`);
      log.plain(`  Firmware:  ${device.firmwareVersion ?? "-"}`);
      log.plain(`  Online:    ${device.online ?? "-"}`);
      log.plain(`  ID (duid): ${device.duid}`);
      log.plain(`  Local key: ${device.localKey}`);
      log.plain();
    }
  } catch (err) {
    if (err instanceof RoborockSessionExpiredError) {
      log.error("The session expired. Run: node-miio roborock login");
    } else {
      log.error(err instanceof RoborockError ? err.message : String(err));
    }
    process.exitCode = 1;
  }
};
