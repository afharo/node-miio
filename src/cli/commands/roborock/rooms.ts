import type { CommandBuilder } from "yargs";

import { roomNames } from "../../../lib/roborock/index";
import { log } from "../../log";

import { connectRobot, robotOptions, type ConnectedRobot } from "./robot";

export const command = "rooms";
export const description =
  "List the rooms of a robot's map, with the names given in the Roborock app";
export const builder: CommandBuilder = {
  ...robotOptions,
  json: { type: "boolean", description: "Print the rooms as JSON" },
};

export const handler = async (argv: {
  ip?: string;
  duid?: string;
  json?: boolean;
}) => {
  let connected: ConnectedRobot | undefined;
  try {
    connected = await connectRobot(argv);
    if (!connected) {
      process.exitCode = 1;
      return;
    }
    const rooms = roomNames(
      await connected.api.call("get_room_mapping", []),
      connected.home.rooms,
    );
    if (argv.json) {
      console.log(JSON.stringify(rooms, null, 2));
      return;
    }
    log.info(`${connected.robot.name}: ${rooms.length} rooms`);
    for (const room of rooms) {
      log.plain(
        `  ${String(room.segmentId).padStart(3)}  ${room.name ?? "(no name)"}`,
      );
    }
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    await connected?.close();
  }
};
