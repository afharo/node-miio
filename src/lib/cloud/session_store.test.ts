import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, test, expect, afterAll, afterEach, vi } from "vitest";

import {
  defaultConfigDir,
  defaultSessionFile,
  deleteSession,
  loadSession,
  saveSession,
} from "./session_store.js";

describe("default config directory", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function platform(name: NodeJS.Platform) {
    vi.spyOn(process, "platform", "get").mockReturnValue(name);
    vi.spyOn(os, "homedir").mockReturnValue(path.join(path.sep, "home", "me"));
  }

  test("MIIO_CONFIG_DIR wins", () => {
    vi.stubEnv("MIIO_CONFIG_DIR", "/custom");
    expect(defaultConfigDir()).toBe("/custom");
    expect(defaultSessionFile()).toBe(
      path.join("/custom", "cloud-session.json"),
    );
  });

  test("macOS uses Application Support", () => {
    vi.stubEnv("MIIO_CONFIG_DIR", "");
    platform("darwin");
    expect(defaultConfigDir()).toBe(
      path.join(
        path.sep,
        "home",
        "me",
        "Library",
        "Application Support",
        "node-miio",
      ),
    );
  });

  test("Windows uses APPDATA, or AppData/Roaming", () => {
    vi.stubEnv("MIIO_CONFIG_DIR", "");
    platform("win32");
    vi.stubEnv("APPDATA", "/appdata");
    expect(defaultConfigDir()).toBe(path.join("/appdata", "node-miio"));
    vi.stubEnv("APPDATA", "");
    expect(defaultConfigDir()).toBe(
      path.join(path.sep, "home", "me", "AppData", "Roaming", "node-miio"),
    );
  });

  test("other platforms use XDG_CONFIG_HOME, or ~/.config", () => {
    vi.stubEnv("MIIO_CONFIG_DIR", "");
    platform("linux");
    vi.stubEnv("XDG_CONFIG_HOME", "/xdg");
    expect(defaultConfigDir()).toBe(path.join("/xdg", "node-miio"));
    vi.stubEnv("XDG_CONFIG_HOME", "");
    expect(defaultConfigDir()).toBe(
      path.join(path.sep, "home", "me", ".config", "node-miio"),
    );
  });
});

describe("session store", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "miio-session-"));
  const file = path.join(dir, "nested", "cloud-session.json");
  const session = { userId: "1", ssecurity: "s", serviceToken: "t" };

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("saves the session readable only by the user, loads and deletes it", async () => {
    await expect(loadSession(file)).resolves.toBeUndefined();
    await saveSession(session, file);
    // Windows doesn't support POSIX file modes
    const mode =
      process.platform === "win32" ? 0o600 : fs.statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
    await expect(loadSession(file)).resolves.toStrictEqual(session);
    await deleteSession(file);
    await expect(loadSession(file)).resolves.toBeUndefined();
  });

  test("ignores invalid files", async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{not json");
    await expect(loadSession(file)).resolves.toBeUndefined();
  });
});
