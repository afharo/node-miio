"use strict";

const { log } = require("../log");
const deviceFinder = require("../device-finder");
const { tokens } = require("../../lib/tokens");
const { stopGracefully } = require("../stop");

exports.command = "discover";
exports.description = "Discover devices on the local network";
exports.builder = {
  sync: {
    type: "boolean",
    description: "Synchronize tokens",
  },
};

exports.handler = function (argv) {
  log.info("Discovering devices. Press Ctrl+C to stop.");
  log.plain();

  const browser = deviceFinder();
  // The tokens being saved, to wait for them before exiting
  const saving = new Set();
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
    if (argv.sync && mgmt.token && mgmt.autoToken) {
      const save = async () => {
        try {
          await tokens.update(device.id, mgmt.token);
        } catch (err) {
          log.error("Could not update token for", device.id, ":", err);
        } finally {
          saving.delete(saved);
        }
      };
      const saved = save();
      saving.add(saved);
    }
  });
};
