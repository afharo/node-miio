"use strict";

const chalk = require("chalk");

const { log } = require("../log");
const deviceFinder = require("../device-finder");

exports.command = "inspect <idOrIp>";
exports.description = "Inspect a device";
exports.builder = {
  token: {
    type: "string",
    description: "The known token of the device to communicate with",
  },
};

exports.handler = function (argv) {
  let target = argv.idOrIp;
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
        log.plain(chalk.bold("Firmware version:"), info.fw_ver);
        log.plain(chalk.bold("Hardware version:"), info.hw_ver);
        if (info.mcu_fw_ver) {
          log.plain(chalk.bold("MCU firmware version:"), info.mcu_fw_ver);
        }
        log.plain();

        if (info.ap) {
          log.plain(
            chalk.bold("WiFi:"),
            info.ap.ssid,
            chalk.dim("(" + info.ap.bssid + ")"),
            chalk.bold("RSSI:"),
            info.ap.rssi,
          );
        } else {
          log.plain(chalk.bold("WiFi:"), "Not Connected");
        }
        if (info.wifi_fw_ver) {
          log.plain(chalk.bold("WiFi firmware version:"), info.wifi_fw_ver);
        }
        log.plain();

        if (info.ot) {
          let type;
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
          log.plain(chalk.bold("Remote access (Mi Home App):"), type);
        } else {
          log.plain(chalk.bold("Remote access (Mi Home App):"), "Maybe");
        }
        log.plain();
      }

      const props = device.properties;
      const keys = Object.keys(props);
      if (keys.length > 0) {
        log.plain(chalk.bold("Properties:"));
        for (const key of keys) {
          log.plain("  -", key + ":", props[key]);
        }
        log.plain();
      }

      if (mgmt.parent) {
        log.plain(chalk.bold("Parent:"));
        log.group(() => {
          log.device(mgmt.parent);
        });
      }
    } catch (err) {
      process.exitCode = 1;
      log.error("Could not inspect the device. Error was:", err.message);
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
};
