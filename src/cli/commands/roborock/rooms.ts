import type { CommandBuilder } from "yargs";

import {
  RoborockError,
  RoborockLocalConnection,
  roomNames,
} from "../../../lib/roborock/index";
import { log } from "../../log";

import { findRobot, robotOptions } from "./robot";

export const command = "rooms";
export const description =
  "List the rooms of a robot's map, with the names given in the Roborock app";
export const builder: CommandBuilder = {
  ...robotOptions,
  json: { type: "boolean", description: "Print the rooms as JSON" },
};

export const handler = async (argv: {
  ip: string;
  duid?: string;
  json?: boolean;
}) => {
  let connection: RoborockLocalConnection | undefined;
  try {
    const found = await findRobot(argv.duid);
    if (!found) {
      process.exitCode = 1;
      return;
    }
    connection = new RoborockLocalConnection({
      address: argv.ip,
      localKey: found.robot.localKey,
    });
    const rooms = roomNames(
      await connection.call("get_room_mapping"),
      found.home.rooms,
    );
    if (argv.json) {
      console.log(JSON.stringify(rooms, null, 2));
      return;
    }
    log.info(`${found.robot.name}: ${rooms.length} rooms`);
    for (const room of rooms) {
      log.plain(
        `  ${String(room.segmentId).padStart(3)}  ${room.name ?? "(no name)"}`,
      );
    }
  } catch (err) {
    log.error(err instanceof RoborockError ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    connection?.close();
  }
};
