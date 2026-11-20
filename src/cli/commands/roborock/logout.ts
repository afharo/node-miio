import {
  defaultRoborockSessionFile,
  deleteRoborockSession,
} from "../../../lib/roborock/index";
import { log } from "../../log";

export const command = "logout";
export const description = "Delete the saved Roborock session";
export const builder = {};

export const handler = async () => {
  await deleteRoborockSession();
  log.info(`Deleted ${defaultRoborockSessionFile()}`);
};
