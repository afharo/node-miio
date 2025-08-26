"use strict";

import path from "node:path";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

yargs(hideBin(process.argv))
  .commandDir(path.join(__dirname, "commands"))
  .recommendCommands()
  .demandCommand();
