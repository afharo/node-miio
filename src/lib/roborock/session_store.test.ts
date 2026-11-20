import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  deleteRoborockSession,
  loadRoborockSession,
  saveRoborockSession,
} from "./session_store";
import type { RoborockSession } from "./web_api";

describe("Roborock session store", () => {
  test("saves (readable only by the user), loads and deletes the session", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "node-miio-rr-"));
    const file = path.join(dir, "sub", "roborock-session.json");
    const session: RoborockSession = {
      email: "me@example.com",
      baseUrl: "https://euiot.roborock.com",
      clientId: "c",
      userData: {
        token: "t",
        rriot: {
          u: "u",
          s: "s",
          h: "h",
          k: "k",
          r: { r: "EU", a: "a", m: "m" },
        },
      },
    };
    await saveRoborockSession(session, file);
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    expect(await loadRoborockSession(file)).toStrictEqual(session);
    await deleteRoborockSession(file);
    expect(await loadRoborockSession(file)).toBeUndefined();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
