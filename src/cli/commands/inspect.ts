import { styleText } from "node:util";

import type { CommandBuilder } from "yargs";

import { log } from "../log";
import deviceFinder from "../device-finder";

export const command = "inspect <idOrIp>";
export const description = "Inspect a device";
export const builder: CommandBuilder = {
  token: {
    type: "string",
    description: "The known token of the device to communicate with",
  },
};

/**
 * Prints what the device reports about itself: model, token, firmware, Wi-Fi, properties and capabilities.
 *
 * @param argv The parsed command line
 * @param argv.idOrIp The device to inspect
 * @param argv.token The token, when it's not saved and the device hides it
 */
export function handler(argv: { idOrIp: string; token?: string }) {
  const target = argv.idOrIp;
  log.info("Attempting to inspect", target);

  let foundDevice = false;
  let pending = 0;
  const browser = deviceFinder({
    instances: true,
    filter: target,
    token: argv.token,
  });
  browser.on("available", async (device) => {
    pending++;
    foundDevice = true;

    // TODO: Error handling
    const mgmt = device.management;
    try {
      const info = await mgmt.info();
      log.plain();
      log.device(device, true);

      if (!mgmt.parent) {
        log.plain(styleText("bold", "Firmware version:"), info.fw_ver);
        log.plain(styleText("bold", "Hardware version:"), info.hw_ver);
        if (info.mcu_fw_ver) {
          log.plain(
            styleText("bold", "MCU firmware version:"),
            info.mcu_fw_ver,
          );
        }
        log.plain();

        if (info.ap) {
          log.plain(
            styleText("bold", "WiFi:"),
            info.ap.ssid,
            styleText("dim", "(" + info.ap.bssid + ")"),
            styleText("bold", "RSSI:"),
            info.ap.rssi,
          );
        } else {
          log.plain(styleText("bold", "WiFi:"), "Not Connected");
        }
        if (info.wifi_fw_ver) {
          log.plain(
            styleText("bold", "WiFi firmware version:"),
            info.wifi_fw_ver,
          );
        }
        log.plain();

        if (info.ot) {
          let type: string;
          switch (info.ot) {
            case "otu":
              type = "UDP";
              break;
            case "ott":
              type = "TCP";
              break;
            default:
              type = "Unknown (" + info.ot + ")";
          }
          log.plain(styleText("bold", "Remote access (Mi Home App):"), type);
        } else {
          log.plain(styleText("bold", "Remote access (Mi Home App):"), "Maybe");
        }
        log.plain();
      }

      const props = device.properties;
      const keys = Object.keys(props);
      if (keys.length > 0) {
        log.plain(styleText("bold", "Properties:"));
        for (const key of keys) {
          log.plain("  -", key + ":", props[key]);
        }
        log.plain();
      }

      if (mgmt.parent) {
        log.plain(styleText("bold", "Parent:"));
        log.group(() => {
          log.device(mgmt.parent);
        });
      }
    } catch (err) {
      process.exitCode = 1;
      log.error(
        "Could not inspect the device. Error was:",
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
  setTimeout(doneHandler, 5000);
  browser.on("done", doneHandler);
}
