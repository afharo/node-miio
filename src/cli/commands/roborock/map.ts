import fs from "node:fs/promises";
import { gzipSync } from "node:zlib";

import type { CommandBuilder } from "yargs";

import { parseRoborockMap } from "../../../lib/maps/roborock_map.js";
import { roomNames } from "../../../lib/roborock/index.js";
import { log } from "../../log.js";

import { connectRobot, robotOptions, type ConnectedRobot } from "./robot.js";

export const command = "map";
export const description =
  "Download the map of a robot: rooms (named as in the Roborock app), robot position and current room";
export const builder: CommandBuilder = {
  ...robotOptions,
  out: {
    type: "string",
    description:
      "Save the raw map file (gzipped), e.g. to attach it to a bug report",
  },
  json: { type: "boolean", description: "Print the result as JSON" },
};

export const handler = async (argv: {
  ip?: string;
  duid?: string;
  out?: string;
  json?: boolean;
}) => {
  let connected: ConnectedRobot | undefined;
  try {
    connected = await connectRobot(argv);
    if (!connected) {
      process.exitCode = 1;
      return;
    }
    const { api, robot, home } = connected;
    const file = await api.getMapData();
    if (argv.out) await fs.writeFile(argv.out, gzipSync(file));
    const map = parseRoborockMap(file);
    const names = new Map(
      roomNames(await api.call("get_room_mapping", []), home.rooms).map(
        (room) => [room.segmentId, room.name],
      ),
    );
    const summary = {
      model: robot.model,
      mapVersion: `${map.majorVersion}.${map.minorVersion}`,
      rooms: map.rooms.map((room) => ({ ...room, name: names.get(room.id) })),
      robot: map.robot,
      charger: map.charger,
      currentRoom: map.currentRoom,
      pathPoints: map.path.length,
    };
    if (argv.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      log.info(`Map of ${robot.name} (${robot.model})`);
      log.plain(`  Rooms: ${map.rooms.length}`);
      for (const room of summary.rooms) {
        log.plain(`    ${room.id}${room.name ? ` (${room.name})` : ""}`);
      }
      log.plain(
        `  Robot:   ${map.robot ? `${map.robot.x}, ${map.robot.y}` : "-"}`,
      );
      log.plain(
        `  Charger: ${map.charger ? `${map.charger.x}, ${map.charger.y}` : "-"}`,
      );
      const current = map.currentRoom;
      log.plain(
        `  Current room: ${
          current === undefined
            ? "none (e.g. docked, or between rooms)"
            : `${current}${names.get(current) ? ` (${names.get(current)})` : ""}`
        }`,
      );
    }
    if (argv.out) log.info(`Map file saved to ${argv.out}`);
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    await connected?.close();
  }
};
