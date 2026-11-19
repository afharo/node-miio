import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { CloudSession } from "./login";

/**
 * The directory of node-miio's private config (the Xiaomi Cloud session). Override it with `MIIO_CONFIG_DIR`.
 *
 * @returns The absolute path to the config directory
 */
export function defaultConfigDir(): string {
  if (process.env.MIIO_CONFIG_DIR) return process.env.MIIO_CONFIG_DIR;
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "node-miio");
    case "win32":
      return path.join(
        process.env.APPDATA || path.join(home, "AppData", "Roaming"),
        "node-miio",
      );
    default:
      return path.join(
        process.env.XDG_CONFIG_HOME || path.join(home, ".config"),
        "node-miio",
      );
  }
}

/**
 * @returns The default path of the saved session
 */
export function defaultSessionFile() {
  return path.join(defaultConfigDir(), "cloud-session.json");
}

/**
 * Saves the session, readable only by the current user (it's as sensitive as a password).
 *
 * @param session The session
 * @param file The file (defaults to {@link defaultSessionFile})
 */
export async function saveSession(
  session: CloudSession,
  file = defaultSessionFile(),
) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, JSON.stringify(session, null, 2), { mode: 0o600 });
  // writeFile's mode only applies to new files
  await fs.chmod(file, 0o600);
}

/**
 * @param file The file (defaults to {@link defaultSessionFile})
 * @returns The saved session, or `undefined` if there's none
 */
export async function loadSession(
  file = defaultSessionFile(),
): Promise<CloudSession | undefined> {
  try {
    const session = JSON.parse(await fs.readFile(file, "utf8"));
    if (session?.ssecurity && session?.serviceToken) return session;
  } catch {
    // No session saved (or unreadable)
  }
  return undefined;
}

/**
 * @param file The file (defaults to {@link defaultSessionFile})
 */
export async function deleteSession(file = defaultSessionFile()) {
  await fs.rm(file, { force: true });
}
