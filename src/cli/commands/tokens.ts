import path from "node:path";

import type { Argv } from "yargs";

export const command = "tokens <command>";
export const description = "Manage tokens of devices";
export const builder = (yargs: Argv) =>
  yargs.commandDir(path.join(__dirname, "tokens"));
export const handler = () => {};
