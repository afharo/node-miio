import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, test, expect, afterAll } from "vitest";

import { deleteSession, loadSession, saveSession } from "./session_store.js";

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
