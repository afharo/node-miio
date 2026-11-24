import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { defaultConfigDir } from "./cloud/session_store";

/**
 * @returns The default path of the saved tokens: `tokens.json` in node-miio's config directory (next to the Xiaomi
 *   Cloud session). Override the directory with `MIIO_CONFIG_DIR`.
 */
export function defaultTokensFile() {
  return path.join(defaultConfigDir(), "tokens.json");
}

/**
 * Where node-miio saved the tokens before (node-persist's default: under the current directory, one file per device,
 * named after the SHA-256 of its id).
 *
 * @param deviceId The device id
 * @returns The path of the device's legacy file
 */
function legacyTokenFile(deviceId: string) {
  const name = crypto.createHash("sha256").update(deviceId).digest("hex");
  return path.join(process.cwd(), ".node-persist", "storage", name);
}

/**
 * Converts a saved token (a hex string, or a Buffer serialised as JSON by node-persist) into a Buffer.
 *
 * @param value The saved value
 * @returns The token, if it is one
 */
function toBuffer(value: unknown): Buffer | undefined {
  if (typeof value === "string" && /^[0-9a-f]+$/i.test(value)) {
    return Buffer.from(value, "hex");
  }
  const data = (value as { data?: unknown } | null)?.data;
  if (Array.isArray(data)) return Buffer.from(data);
  return undefined;
}

/**
 * Shared storage of the devices' tokens, by device id: a JSON file readable only by the current user (tokens are
 * secrets). The tokens saved by older versions (under `.node-persist/storage` in the current directory) are moved to it
 * when they are read.
 */
export class Tokens {
  /** Writes one at a time, so concurrent updates (e.g. `discover --sync`) don't overwrite each other */
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * @param file The file (defaults to {@link defaultTokensFile}, resolved on every call so `MIIO_CONFIG_DIR` applies)
   */
  constructor(private readonly file?: string) {}

  private get path() {
    return this.file ?? defaultTokensFile();
  }

  private async readAll(): Promise<Record<string, string>> {
    try {
      const saved = JSON.parse(await fs.readFile(this.path, "utf8"));
      return saved && typeof saved === "object" ? saved : {};
    } catch {
      return {};
    }
  }

  private async readLegacy(deviceId: string): Promise<Buffer | undefined> {
    try {
      const datum = JSON.parse(
        await fs.readFile(legacyTokenFile(deviceId), "utf8"),
      );
      return datum?.key === deviceId ? toBuffer(datum.value) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * @param deviceId The device id (without the `miio:` prefix)
   * @returns The saved token, or `undefined` if there's none
   */
  async get(deviceId: string): Promise<Buffer | undefined> {
    await this.queue;
    const saved = toBuffer((await this.readAll())[deviceId]);
    if (saved) return saved;
    const legacy = await this.readLegacy(deviceId);
    if (legacy) {
      // Moved to the new file: later reads don't depend on the current directory
      await this.update(deviceId, legacy).catch(() => undefined);
    }
    return legacy;
  }

  private async write(deviceId: string, hex: string) {
    const all = await this.readAll();
    all[deviceId] = hex;
    await fs.mkdir(path.dirname(this.path), { recursive: true, mode: 0o700 });
    await fs.writeFile(this.path, JSON.stringify(all, null, 2), {
      mode: 0o600,
    });
    // writeFile's mode only applies to new files
    await fs.chmod(this.path, 0o600);
  }

  /**
   * Saves the token of a device.
   *
   * @param deviceId The device id (without the `miio:` prefix)
   * @param token The token
   */
  update(deviceId: string, token: Buffer | string) {
    const hex = Buffer.isBuffer(token) ? token.toString("hex") : token;
    const write = this.queue.then(() => this.write(deviceId, hex));
    this.queue = write.catch(() => undefined);
    return write;
  }
}

export const tokens = new Tokens();
