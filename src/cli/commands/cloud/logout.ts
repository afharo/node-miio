import { deleteSession, defaultSessionFile } from "../../../lib/cloud/index.js";
import { log } from "../../log.js";

export const command = "logout";
export const description = "Delete the saved Xiaomi Cloud session";
export const builder = {};

export const handler = async () => {
  await deleteSession();
  log.info(`Deleted ${defaultSessionFile()}`);
};
