import type { Argv, CommandBuilder, CommandModule } from "yargs";

import * as call from "./roborock/call.js";
import * as devices from "./roborock/devices.js";
import * as login from "./roborock/login.js";
import * as logout from "./roborock/logout.js";
import * as map from "./roborock/map.js";
import * as rooms from "./roborock/rooms.js";

export const command = "roborock <command>";
export const description =
  "Use a Roborock app account (opt-in, experimental): log in, list your robots, their rooms and maps, call methods";
export const builder: CommandBuilder = (yargs: Argv) =>
  yargs
    .command(login as unknown as CommandModule)
    .command(devices as unknown as CommandModule)
    .command(rooms as unknown as CommandModule)
    .command(map as unknown as CommandModule)
    .command(call as unknown as CommandModule)
    .command(logout as unknown as CommandModule);
export const handler = () => {};
