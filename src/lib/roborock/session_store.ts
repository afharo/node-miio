import fs from "node:fs/promises";
import path from "node:path";

import { defaultConfigDir } from "../cloud/session_store";

import type { RoborockSession } from "./web_api";

/**
 * @returns The default path of the saved Roborock session (next to the Xiaomi Cloud one)
 */
export function defaultRoborockSessionFile() {
  return path.join(defaultConfigDir(), "roborock-session.json");
}

/**
 * Saves the session, readable only by the current user (it's as sensitive as a password).
 *
 * @param session The session
 * @param file The file (defaults to {@link defaultRoborockSessionFile})
 */
export async function saveRoborockSession(
  session: RoborockSession,
  file = defaultRoborockSessionFile(),
) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, JSON.stringify(session, null, 2), { mode: 0o600 });
  // writeFile's mode only applies to new files
  await fs.chmod(file, 0o600);
}

/**
 * @param file The file (defaults to {@link defaultRoborockSessionFile})
 * @returns The saved session, or `undefined` if there's none
 */
export async function loadRoborockSession(
  file = defaultRoborockSessionFile(),
): Promise<RoborockSession | undefined> {
  try {
    const session = JSON.parse(await fs.readFile(file, "utf8"));
    if (session?.userData?.token && session?.userData?.rriot) return session;
  } catch {
    // No session saved (or unreadable)
  }
  return undefined;
}

/**
 * @param file The file (defaults to {@link defaultRoborockSessionFile})
 */
export async function deleteRoborockSession(
  file = defaultRoborockSessionFile(),
) {
  await fs.rm(file, { force: true });
}
