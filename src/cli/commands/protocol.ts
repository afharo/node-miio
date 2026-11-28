import type { Argv, CommandBuilder, CommandModule } from "yargs";

import * as call from "./protocol/call.js";
import * as jsonDump from "./protocol/json-dump.js";
import * as packet from "./protocol/packet.js";

export const command = "protocol <command>";
export const description = "Inspect and test raw miIO-commands";
export const builder: CommandBuilder = (yargs: Argv) =>
  yargs
    .command(call as unknown as CommandModule)
    .command(jsonDump as unknown as unknown as CommandModule)
    .command(packet as unknown as unknown as CommandModule);
export const handler = () => {};
