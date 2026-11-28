import { EventEmitter } from "node:events";

import { describe, test, expect, beforeEach, vi, type Mock } from "vitest";

import { log } from "../log.js";
import { stopGracefully } from "../stop.js";
import { tokens } from "../../lib/tokens.js";
import { deviceFinder } from "../device-finder.js";

import * as discover from "./discover.js";

vi.mock("../device-finder.js", () => ({ deviceFinder: vi.fn() }));
vi.mock("../stop.js", () => ({ stopGracefully: vi.fn() }));
vi.mock("../../lib/tokens.js", () => ({ tokens: { update: vi.fn() } }));
vi.mock("../log.js", () => ({
  log: {
    info: vi.fn(),
    plain: vi.fn(),
    error: vi.fn(),
    device: vi.fn(),
  },
}));

const mockedFinder = deviceFinder as Mock;

const update = tokens.update as Mock;

function start(argv: Record<string, unknown> = {}) {
  const browser = Object.assign(new EventEmitter(), {
    destroy: vi.fn().mockResolvedValue(undefined),
  });
  mockedFinder.mockReturnValue(browser);
  discover.handler(argv);
  const [stop, onStopping] = (stopGracefully as Mock).mock.calls.at(-1) ?? [];
  return { browser, stop, onStopping };
}

const device = {
  id: "miio:123",
  management: { token: Buffer.from("00ff", "hex"), autoToken: true },
};

describe("discover", () => {
  beforeEach(() => vi.clearAllMocks());

  test("stopping waits for the tokens being saved, then closes the discovery", async () => {
    let saved!: () => void;
    update.mockReturnValue(new Promise<void>((resolve) => (saved = resolve)));
    const { browser, stop, onStopping } = start({ sync: true });
    browser.emit("available", device);
    expect(update).toHaveBeenCalledWith("miio:123", device.management.token);

    onStopping();
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining("Ctrl+C again"),
    );
    const stopped = stop();
    await new Promise(setImmediate);
    expect(browser.destroy).not.toHaveBeenCalled();

    saved();
    await stopped;
    expect(browser.destroy).toHaveBeenCalled();
  });

  test("a token that can't be saved is reported, and doesn't block stopping", async () => {
    update.mockRejectedValue(new Error("disk full"));
    const { browser, stop } = start({ sync: true });
    browser.emit("available", device);
    await stop();
    expect(log.error).toHaveBeenCalledWith(
      "Could not update token for",
      "miio:123",
      ":",
      expect.any(Error),
    );
    expect(browser.destroy).toHaveBeenCalled();
  });

  test("without --sync, no token is saved", async () => {
    const { browser, stop } = start();
    browser.emit("available", device);
    await stop();
    expect(update).not.toHaveBeenCalled();
  });
});
