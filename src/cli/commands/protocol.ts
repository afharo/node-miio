import path from "node:path";

import type { Argv } from "yargs";

export const command = "protocol <command>";
export const description = "Inspect and test raw miIO-commands";
export const builder = (yargs: Argv) =>
  yargs.commandDir(path.join(__dirname, "protocol"));
export const handler = () => {};
