import fs from "node:fs/promises";

import type { CommandBuilder } from "yargs";

import {
  CloudError,
  CloudSessionExpiredError,
  loadSession,
  XiaomiCloud,
} from "../../../lib/cloud/index.js";
import { connectToDevice } from "../../../lib/connect_to_device.js";
import { Vacuum } from "../../../lib/devices/vacuums/vacuum.js";
import { parseRoborockMap } from "../../../lib/maps/roborock_map.js";
import { log } from "../../log.js";

export const command = "map <device>";
export const description =
  "Download the map of a Roborock vacuum: rooms, robot position and current room";
export const builder: CommandBuilder = {
  ip: {
    type: "string",
    description:
      "The IP of the vacuum (defaults to the one reported by the Xiaomi Cloud)",
  },
  out: {
    type: "string",
    description:
      "Save the raw map file (gzipped), e.g. to attach it to a bug report",
  },
  json: { type: "boolean", description: "Print the result as JSON" },
};

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export const handler = async (argv: {
  device: string;
  ip?: string;
  out?: string;
  json?: boolean;
}) => {
  const session = await loadSession();
  if (!session) {
    log.error("Not logged in. Run: node-miio cloud login");
    process.exitCode = 1;
    return;
  }

  let vacuum: Vacuum | undefined;
  try {
    const cloud = new XiaomiCloud(session);
    const target = String(argv.device);
    const device = await cloud.findDevice(
      IPV4.test(target) ? { ip: target } : { did: target },
    );
    if (!device) {
      log.error(
        `${target} isn't in your Xiaomi account (use the device ID or IP from: node-miio cloud devices)`,
      );
      process.exitCode = 1;
      return;
    }
    if (!/^(roborock|rockrobo)\./.test(device.model)) {
      log.error(
        `Only Roborock maps are supported for now (${device.model}). Please open an issue to request your model.`,
      );
      process.exitCode = 1;
      return;
    }
    const address = argv.ip ?? (IPV4.test(target) ? target : device.localip);
    if (!address) {
      log.error("The IP of the vacuum is unknown: use --ip");
      process.exitCode = 1;
      return;
    }

    // The map name comes from the vacuum itself (local network), the file from the cloud
    const connected = await connectToDevice({
      address,
      token: device.token,
    });
    if (!(connected instanceof Vacuum)) {
      log.error(`Unexpected device type for ${device.model}`);
      process.exitCode = 1;
      return;
    }
    vacuum = connected;

    const name = await vacuum.getMapName();
    const url = await cloud.getMapFileUrl(device.server, name);
    const file = await cloud.download(url);
    if (argv.out) {
      await fs.writeFile(argv.out, file);
    }
    const map = parseRoborockMap(file);
    const roomNames = new Map<number, string>();
    try {
      for (const [id, roomName] of await vacuum.getRoomMap()) {
        roomNames.set(Number(id), String(roomName));
      }
    } catch {
      // Older firmware: no room names
    }

    const summary = {
      model: device.model,
      mapVersion: `${map.majorVersion}.${map.minorVersion}`,
      rooms: map.rooms.map((room) => ({
        ...room,
        name: roomNames.get(room.id),
      })),
      robot: map.robot,
      charger: map.charger,
      currentRoom: map.currentRoom,
      pathPoints: map.path.length,
    };
    if (argv.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      log.info(`Map of ${device.name} (${device.model})`);
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
            : `${current}${roomNames.get(current) ? ` (${roomNames.get(current)})` : ""}`
        }`,
      );
    }
    if (argv.out) log.info(`Map file saved to ${argv.out}`);
  } catch (err) {
    if (err instanceof CloudSessionExpiredError) {
      log.error("The session expired. Run: node-miio cloud login");
    } else {
      log.error(
        err instanceof CloudError || err instanceof Error
          ? err.message
          : String(err),
      );
    }
    process.exitCode = 1;
  } finally {
    await vacuum?.destroy();
    // The miIO network socket keeps the process alive
    setTimeout(() => process.exit(), 100).unref(); // eslint-disable-line n/no-process-exit
  }
};
