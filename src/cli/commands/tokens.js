"use strict";

const path = require("node:path");

exports.command = "tokens <command>";
exports.description = "Manage tokens of devices";
exports.builder = (yargs) => yargs.commandDir(path.join(__dirname, "tokens"));
exports.handler = () => {};
