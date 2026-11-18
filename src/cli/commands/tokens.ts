import type { Argv, CommandBuilder, CommandModule } from "yargs";

import * as update from "./tokens/update";

export const command = "tokens <command>";
export const description = "Manage tokens of devices";
export const builder: CommandBuilder = (yargs: Argv) =>
  yargs.command(update as unknown as CommandModule);
export const handler = () => {};
