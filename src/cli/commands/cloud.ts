import type { Argv, CommandBuilder, CommandModule } from "yargs";

import * as devices from "./cloud/devices.js";
import * as login from "./cloud/login.js";
import * as logout from "./cloud/logout.js";
import * as map from "./cloud/map.js";

export const command = "cloud <command>";
export const description =
  "Use the Xiaomi Cloud (opt-in): log in, list your devices with their tokens, download maps";
export const builder: CommandBuilder = (yargs: Argv) =>
  yargs
    .command(login as unknown as CommandModule)
    .command(devices as unknown as CommandModule)
    .command(map as unknown as CommandModule)
    .command(logout as unknown as CommandModule);
export const handler = () => {};
