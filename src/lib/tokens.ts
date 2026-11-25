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
 * @param deviceId A device id, with or without the `miio:` prefix of `device.id`
 * @returns The id the tokens are saved under (without the prefix)
 */
function key(deviceId: string | number) {
  return `${deviceId}`.replace(/^miio:/, "");
}

/**
 * Shared storage of the devices' tokens, by device id: a JSON file readable only by the current user (tokens are
 * secrets).
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

  /**
   * @param deviceId The device id (with or without the `miio:` prefix)
   * @returns The saved token, or `undefined` if there's none
   */
  async get(deviceId: string | number): Promise<Buffer | undefined> {
    await this.queue;
    const saved = (await this.readAll())[key(deviceId)];
    return typeof saved === "string" && /^[0-9a-f]+$/i.test(saved)
      ? Buffer.from(saved, "hex")
      : undefined;
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
   * @param deviceId The device id (with or without the `miio:` prefix)
   * @param token The token
   */
  update(deviceId: string | number, token: Buffer | string) {
    const hex = Buffer.isBuffer(token) ? token.toString("hex") : token;
    const write = this.queue.then(() => this.write(key(deviceId), hex));
    this.queue = write.catch(() => undefined);
    return write;
  }
}

export const tokens = new Tokens();
