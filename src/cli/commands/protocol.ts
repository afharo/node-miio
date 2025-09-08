import path from "node:path";

import type { Argv, CommandBuilder } from "yargs";

export const command = "protocol <command>";
export const description = "Inspect and test raw miIO-commands";
export const builder: CommandBuilder = (yargs: Argv) =>
  yargs.commandDir(path.join(__dirname, "protocol"));
export const handler = () => {};
