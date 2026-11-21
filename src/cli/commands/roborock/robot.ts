import {
  loadRoborockSession,
  RoborockDeviceApi,
  RoborockMqttSession,
  RoborockWebApi,
  toDevices,
  type RoborockDevice,
  type RoborockHomeData,
} from "../../../lib/roborock/index";
import { log } from "../../log";

export const robotOptions = {
  ip: {
    type: "string",
    description:
      "The robot's IP address. Optional: it's asked to the robot through Roborock's cloud (MQTT)",
  },
  duid: {
    type: "string",
    description:
      "The robot's ID (`roborock devices`). Not needed with a single robot.",
  },
} as const;

export interface ConnectedRobot {
  robot: RoborockDevice;
  home: RoborockHomeData;
  api: RoborockDeviceApi;
  /** Closes the connections */
  close: () => Promise<void>;
}

/**
 * Connects to a robot of the saved account: locally (with its IP, or the IP it reports over MQTT), else over MQTT.
 *
 * @param options The options
 * @param options.duid The robot's ID (optional with a single robot)
 * @param options.ip The robot's IP (optional)
 * @returns The robot, or `undefined` (with the error logged)
 */
export async function connectRobot(options: {
  duid?: string;
  ip?: string;
}): Promise<ConnectedRobot | undefined> {
  const session = await loadRoborockSession();
  if (!session) {
    log.error("Not logged in. Run: node-miio roborock login");
    return undefined;
  }
  const home = await new RoborockWebApi(session).getHomeData();
  const robots = toDevices(home);
  const robot = options.duid
    ? robots.find((r) => r.duid === options.duid)
    : robots.length === 1
      ? robots[0]
      : undefined;
  if (!robot) {
    log.error(
      options.duid
        ? `No robot with ID ${options.duid}. See: node-miio roborock devices`
        : "Several robots in this account: choose one with --duid (see: node-miio roborock devices)",
    );
    return undefined;
  }
  const mqtt = new RoborockMqttSession(session.userData.rriot);
  const api = new RoborockDeviceApi({
    ...robot,
    model: robot.model ?? "",
    address: options.ip,
    mqtt,
  });
  return {
    robot,
    home,
    api,
    close: async () => {
      api.close();
      await mqtt.close();
    },
  };
}
