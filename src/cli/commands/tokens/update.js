"use strict";

const { log } = require("../../log");
const deviceFinder = require("../../device-finder");

exports.command = "update <idOrIp>";
exports.description = "Update the token to use for the given device";
exports.builder = {
  token: {
    required: true,
    description: "The token to set",
  },
};

exports.handler = function (argv) {
  let target = argv.idOrIp;
  log.info("Updating token for", target);

  let foundDevice = false;
  let pending = 0;
  // Connect with the new token: robots that hide theirs can't be reached without it
  const browser = deviceFinder({
    filter: target,
    token: argv.token,
  });
  browser.on("available", async (device) => {
    pending++;
    foundDevice = true;

    log.plain();
    log.info("Connected to", device.id, " - trying to change token");
    log.plain();

    try {
      const status = await device.management.updateToken(argv.token);
      if (status) {
        log.plain("Token has been updated");
      } else {
        log.error("Could not update token, double-check the given token");
        process.exitCode = 1;
      }
    } catch (err) {
      process.exitCode = 1;
      log.error("Could update token. Error was:", err.message);
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
