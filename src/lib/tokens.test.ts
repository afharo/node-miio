import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { defaultTokensFile, Tokens } from "./tokens";

const TOKEN = Buffer.from("00112233445566778899aabbccddeeff", "hex");

describe("Tokens", () => {
  let dir: string;
  let file: string;
  let cwd: jest.SpyInstance;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "node-miio-tokens-"));
    file = path.join(dir, "config", "tokens.json");
    cwd = jest.spyOn(process, "cwd").mockReturnValue(dir);
  });

  afterEach(async () => {
    cwd.mockRestore();
    await fs.rm(dir, { recursive: true, force: true });
  });

  /** Saves a token the way node-persist (older versions) did */
  async function saveLegacy(id: string, value: unknown) {
    const storage = path.join(dir, ".node-persist", "storage");
    await fs.mkdir(storage, { recursive: true });
    const name = crypto.createHash("sha256").update(id).digest("hex");
    await fs.writeFile(
      path.join(storage, name),
      JSON.stringify({ key: id, value }),
    );
  }

  test("nothing saved", async () => {
    expect(await new Tokens(file).get("123")).toBeUndefined();
  });

  test("saves and reads a token, readable only by the user", async () => {
    const tokens = new Tokens(file);
    await tokens.update("123", TOKEN);
    expect(await tokens.get("123")).toEqual(TOKEN);
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({
      "123": TOKEN.toString("hex"),
    });
    // Windows has no Unix permissions
    const mode = (await fs.stat(file)).mode & 0o777;
    expect(process.platform === "win32" || mode === 0o600).toBe(true);
  });

  test("takes hex strings", async () => {
    const tokens = new Tokens(file);
    await tokens.update("123", TOKEN.toString("hex"));
    expect(await tokens.get("123")).toEqual(TOKEN);
  });

  test("concurrent updates keep every token", async () => {
    const tokens = new Tokens(file);
    await Promise.all(["1", "2", "3"].map((id) => tokens.update(id, TOKEN)));
    expect(
      Object.keys(JSON.parse(await fs.readFile(file, "utf8"))).sort(),
    ).toEqual(["1", "2", "3"]);
  });

  test("an unreadable file counts as empty", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "not json");
    const tokens = new Tokens(file);
    expect(await tokens.get("123")).toBeUndefined();
    await tokens.update("123", TOKEN);
    expect(await tokens.get("123")).toEqual(TOKEN);
  });

  test("moves the tokens saved by older versions", async () => {
    await saveLegacy("123", JSON.parse(JSON.stringify(TOKEN)));
    const tokens = new Tokens(file);
    expect(await tokens.get("123")).toEqual(TOKEN);
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({
      "123": TOKEN.toString("hex"),
    });
  });

  test("ignores legacy files of other devices, or without a token", async () => {
    await saveLegacy("123", { foo: 1 });
    const tokens = new Tokens(file);
    expect(await tokens.get("123")).toBeUndefined();
    expect(await tokens.get("456")).toBeUndefined();
  });

  test("the default file is in MIIO_CONFIG_DIR", () => {
    const previous = process.env.MIIO_CONFIG_DIR;
    process.env.MIIO_CONFIG_DIR = dir;
    try {
      expect(defaultTokensFile()).toBe(path.join(dir, "tokens.json"));
    } finally {
      if (previous === undefined) delete process.env.MIIO_CONFIG_DIR;
      else process.env.MIIO_CONFIG_DIR = previous;
    }
  });
});
