import {
  defaultRoborockSessionFile,
  deleteRoborockSession,
} from "../../../lib/roborock/index.js";
import { log } from "../../log.js";

export const command = "logout";
export const description = "Delete the saved Roborock session";
export const builder = {};

export const handler = async () => {
  await deleteRoborockSession();
  log.info(`Deleted ${defaultRoborockSessionFile()}`);
};
