import type { CommandBuilder } from "yargs";

import {
  CLOUD_SERVERS,
  type CloudServer,
  CloudError,
  CloudSessionExpiredError,
  loadSession,
  XiaomiCloud,
} from "../../../lib/cloud/index.js";
import { tokens } from "../../../lib/tokens.js";
import { log } from "../../log.js";

export const command = "devices";
export const description =
  "List the devices of your Xiaomi account, with their tokens";
export const builder: CommandBuilder = {
  server: {
    type: "string",
    choices: [...CLOUD_SERVERS],
    description: "Only check this server (all of them by default)",
  },
  json: { type: "boolean", description: "Print the devices as JSON" },
  save: {
    type: "boolean",
    description: "Save the tokens, so other node-miio commands can use them",
  },
};

export const handler = async (argv: {
  server?: CloudServer;
  json?: boolean;
  save?: boolean;
}) => {
  const session = await loadSession();
  if (!session) {
    log.error("Not logged in. Run: node-miio cloud login");
    process.exitCode = 1;
    return;
  }
  try {
    const cloud = new XiaomiCloud(session);
    const devices = await cloud.getDevices({
      servers: argv.server ? [argv.server] : undefined,
    });

    if (argv.save) {
      for (const device of devices) {
        if (/^[0-9a-f]{32}$/i.test(device.token)) {
          await tokens.update(device.did, Buffer.from(device.token, "hex"));
        }
      }
    }

    if (argv.json) {
      console.log(JSON.stringify(devices, null, 2));
      return;
    }
    if (devices.length === 0) {
      log.info("No devices found in this account.");
      return;
    }
    for (const device of devices) {
      log.plain(device.name);
      log.plain(`  Model:  ${device.model}`);
      log.plain(`  IP:     ${device.localip ?? "-"}`);
      log.plain(`  ID:     ${device.did}`);
      log.plain(`  Token:  ${device.token || "-"}`);
      log.plain(`  Server: ${device.server}`);
      log.plain();
    }
    if (argv.save) log.info("Tokens saved.");
  } catch (err) {
    if (err instanceof CloudSessionExpiredError) {
      log.error("The session expired. Run: node-miio cloud login");
    } else {
      log.error(err instanceof CloudError ? err.message : String(err));
    }
    process.exitCode = 1;
  }
};
