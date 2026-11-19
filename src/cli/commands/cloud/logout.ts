import { deleteSession, defaultSessionFile } from "../../../lib/cloud/index";
import { log } from "../../log";

export const command = "logout";
export const description = "Delete the saved Xiaomi Cloud session";
export const builder = {};

export const handler = async () => {
  await deleteSession();
  log.info(`Deleted ${defaultSessionFile()}`);
};
