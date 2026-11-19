#!/usr/bin/env node
"use strict";

import yargs, { type CommandModule } from "yargs";
import { hideBin } from "yargs/helpers";

import * as cloud from "./commands/cloud";
import * as configure from "./commands/configure";
import * as control from "./commands/control";
import * as discover from "./commands/discover";
import * as inspect from "./commands/inspect";
import * as protocol from "./commands/protocol";
import * as spec from "./commands/miot-spec";
import * as tokens from "./commands/tokens";

// Commands are registered explicitly (instead of `commandDir`) because
// `commandDir` is not supported when yargs is loaded as an ES module.
void yargs(hideBin(process.argv))
  .scriptName("node-miio")
  .command(cloud as unknown as CommandModule)
  .command(configure as unknown as CommandModule)
  .command(control as unknown as CommandModule)
  .command(discover as unknown as CommandModule)
  .command(inspect as unknown as CommandModule)
  .command(protocol as unknown as CommandModule)
  .command(spec as unknown as CommandModule)
  .command(tokens as unknown as CommandModule)
  .recommendCommands()
  .demandCommand()
  .strict()
  .parse();
