"use strict";

const { log } = require("../log");
const deviceFinder = require("../device-finder");
const { tokens } = require("../../lib/tokens");

exports.command = "configure <idOrIp>";
exports.description = "Control a device by invoking the given method";
exports.builder = {
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

exports.handler = function (argv) {
  let target = argv.idOrIp;
  log.info("Attempting to configure", target);

  let foundDevice = false;
  let pending = 0;
  const browser = deviceFinder({
    filter: target,
    token: argv.token,
  });
  browser.on("available", async (device) => {
    pending++;
    foundDevice = true;

    log.plain();

    try {
      await device.management.updateWireless({
        ssid: argv.ssid,
        passwd: argv.passwd,
      });
      log.plain("Updated wireless configuration");

      await tokens.update(device.id, device.management.token);
    } catch (err) {
      process.exitCode = 1;
      log.error("Encountered an error while updating wireless");
      log.plain();
      log.plain("Error was:");
      log.plain(err.message);
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
