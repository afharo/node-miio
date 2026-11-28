#!/usr/bin/env node
import yargs, { type CommandModule } from "yargs";
import { hideBin } from "yargs/helpers";

import { reportWhenDone } from "./done.js";
import * as cloud from "./commands/cloud.js";
import * as configure from "./commands/configure.js";
import * as control from "./commands/control.js";
import * as discover from "./commands/discover.js";
import * as inspect from "./commands/inspect.js";
import * as protocol from "./commands/protocol.js";
import * as roborock from "./commands/roborock.js";
import * as spec from "./commands/miot-spec.js";
import * as tokens from "./commands/tokens.js";

// Commands are registered explicitly (instead of `commandDir`) because
// `commandDir` is not supported when yargs is loaded as an ES module.
void yargs(hideBin(process.argv))
  .scriptName("node-miio")
  .middleware(reportWhenDone())
  .command(cloud as unknown as CommandModule)
  .command(configure as unknown as CommandModule)
  .command(control as unknown as CommandModule)
  .command(discover as unknown as CommandModule)
  .command(inspect as unknown as CommandModule)
  .command(protocol as unknown as CommandModule)
  .command(roborock as unknown as CommandModule)
  .command(spec as unknown as CommandModule)
  .command(tokens as unknown as CommandModule)
  .recommendCommands()
  .demandCommand()
  .strict()
  .parse();
