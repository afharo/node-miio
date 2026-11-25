"use strict";

const { log } = require("../../log");
const deviceFinder = require("../../device-finder");
const { parseCallParams } = require("../../params");

exports.command = "call <idOrIp> <method> [params...]";
exports.description = "Call a raw method on a device";
exports.builder = {
  token: {
    type: "string",
    description: "The known token of the device to communicate with",
  },
};

exports.handler = function (argv) {
  let target = argv.idOrIp;
  log.info("Attempting to call", argv.method, "on", target);

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
    log.info("Device found, making call");
    log.plain();

    const parsedArgs = parseCallParams(argv.params);
    log.plain(JSON.stringify(parsedArgs));
    try {
      const result = await device.miioCall(argv.method, parsedArgs);
      log.info("Got result:");
      log.plain(JSON.stringify(result, null, "  "));
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
