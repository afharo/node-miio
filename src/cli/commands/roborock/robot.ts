import {
  loadRoborockSession,
  RoborockWebApi,
  toDevices,
  type RoborockDevice,
  type RoborockHomeData,
} from "../../../lib/roborock/index";
import { log } from "../../log";

export const robotOptions = {
  ip: {
    type: "string",
    demandOption: true,
    description:
      "The robot's IP address (in the Roborock app: the robot's settings → Network info)",
  },
  duid: {
    type: "string",
    description:
      "The robot's ID (`roborock devices`). Not needed with a single robot.",
  },
} as const;

/**
 * @param duid The robot's ID (optional with a single robot)
 * @returns The robot and the home data, or `undefined` (with the error logged)
 */
export async function findRobot(
  duid?: string,
): Promise<{ robot: RoborockDevice; home: RoborockHomeData } | undefined> {
  const session = await loadRoborockSession();
  if (!session) {
    log.error("Not logged in. Run: node-miio roborock login");
    return undefined;
  }
  const api = new RoborockWebApi(session);
  const home = await api.getHomeData();
  const robots = toDevices(home);
  const robot = duid
    ? robots.find((r) => r.duid === duid)
    : robots.length === 1
      ? robots[0]
      : undefined;
  if (!robot) {
    log.error(
      duid
        ? `No robot with ID ${duid}. See: node-miio roborock devices`
        : "Several robots in this account: choose one with --duid (see: node-miio roborock devices)",
    );
    return undefined;
  }
  return { robot, home };
}
