import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { defaultTokensFile, Tokens } from "./tokens";

const TOKEN = Buffer.from("00112233445566778899aabbccddeeff", "hex");

describe("Tokens", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "node-miio-tokens-"));
    file = path.join(dir, "config", "tokens.json");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

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

  test("ids are the same with or without the miio: prefix of device.id", async () => {
    // `discover --sync` and `configure` save by `device.id` ("miio:123"); the lookups use the bare id
    const tokens = new Tokens(file);
    await tokens.update("miio:123", TOKEN);
    expect(await tokens.get("123")).toEqual(TOKEN);
    expect(await tokens.get("miio:123")).toEqual(TOKEN);
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({
      "123": TOKEN.toString("hex"),
    });
  });

  test("numeric ids", async () => {
    const tokens = new Tokens(file);
    await tokens.update(123, TOKEN);
    expect(await tokens.get("123")).toEqual(TOKEN);
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

  test("ignores a value that isn't a token", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ "123": { foo: 1 } }));
    expect(await new Tokens(file).get("123")).toBeUndefined();
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
