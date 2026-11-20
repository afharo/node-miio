import type { Argv, CommandBuilder, CommandModule } from "yargs";

import * as devices from "./roborock/devices";
import * as login from "./roborock/login";
import * as logout from "./roborock/logout";

export const command = "roborock <command>";
export const description =
  "Use a Roborock app account (opt-in, experimental): log in and list your robots";
export const builder: CommandBuilder = (yargs: Argv) =>
  yargs
    .command(login as unknown as CommandModule)
    .command(devices as unknown as CommandModule)
    .command(logout as unknown as CommandModule);
export const handler = () => {};
