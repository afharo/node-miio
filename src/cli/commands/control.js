"use strict";

const { log } = require("../log");
const deviceFinder = require("../device-finder");
const { parseArgs } = require("../params");

exports.command = "control <idOrIp> <method> [params..]";
exports.description = "Control a device by invoking the given method";
exports.builder = {
  token: {
    type: "string",
    description: "The known token of the device to communicate with",
  },
};

exports.handler = function (argv) {
  let target = argv.idOrIp;
  log.info("Attempting to invoke", argv.method, "on", target);

  let foundDevice = false;
  let pending = 0;
  const browser = deviceFinder({
    filter: target,
    token: argv.token,
  });
  browser.on("available", async (device) => {
    if (!device[argv.method]) {
      log.error("The method " + argv.method + " is not available");
      process.exitCode = 1;
      process.exit(); // eslint-disable-line n/no-process-exit
    }

    pending++;
    foundDevice = true;

    try {
      const result = await Promise.resolve(
        device[argv.method](...parseArgs(argv.params)),
      );
      // Methods that change something return nothing: the "Done" line says it worked
      if (result !== undefined) {
        log.plain(JSON.stringify(result, null, "  "));
      }
    } catch (err) {
      process.exitCode = 1;
      log.error("Encountered an error while controlling device");
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
