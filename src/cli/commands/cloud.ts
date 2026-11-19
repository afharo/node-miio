import type { Argv, CommandBuilder, CommandModule } from "yargs";

import * as devices from "./cloud/devices";
import * as login from "./cloud/login";
import * as logout from "./cloud/logout";

export const command = "cloud <command>";
export const description =
  "Use the Xiaomi Cloud (opt-in): log in and list your devices with their tokens";
export const builder: CommandBuilder = (yargs: Argv) =>
  yargs
    .command(login as unknown as CommandModule)
    .command(devices as unknown as CommandModule)
    .command(logout as unknown as CommandModule);
export const handler = () => {};
