import { EventEmitter } from "node:events";

import { log } from "../log";
import { stopGracefully } from "../stop";
import { tokens } from "../../lib/tokens";
import { deviceFinder } from "../device-finder";

import * as discover from "./discover";

jest.mock("../device-finder", () => ({ deviceFinder: jest.fn() }));
jest.mock("../stop", () => ({ stopGracefully: jest.fn() }));
jest.mock("../../lib/tokens", () => ({ tokens: { update: jest.fn() } }));
jest.mock("../log", () => ({
  log: {
    info: jest.fn(),
    plain: jest.fn(),
    error: jest.fn(),
    device: jest.fn(),
  },
}));

const mockedFinder = deviceFinder as jest.Mock;

const update = tokens.update as jest.Mock;

function start(argv: Record<string, unknown> = {}) {
  const browser = Object.assign(new EventEmitter(), {
    destroy: jest.fn().mockResolvedValue(undefined),
  });
  mockedFinder.mockReturnValue(browser);
  discover.handler(argv);
  const [stop, onStopping] = (stopGracefully as jest.Mock).mock.calls.at(-1);
  return { browser, stop, onStopping };
}

const device = {
  id: "miio:123",
  management: { token: Buffer.from("00ff", "hex"), autoToken: true },
};

describe("discover", () => {
  beforeEach(() => jest.clearAllMocks());

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
