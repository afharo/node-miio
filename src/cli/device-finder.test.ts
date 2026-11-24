import { EventEmitter } from "node:events";

jest.mock("../lib/connect_to_device", () => ({ connectToDevice: jest.fn() }));
jest.mock("../lib/tokens", () => ({ tokens: { get: jest.fn() } }));
jest.mock("../lib/discovery", () => ({ Devices: jest.fn() }));

import { connectToDevice } from "../lib/connect_to_device";
import { tokens } from "../lib/tokens";
import { Devices } from "../lib/discovery";
import { Placeholder } from "../lib/placeholder";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const deviceFinder = require("./device-finder");
const { withSavedToken } = deviceFinder;

const connect = connectToDevice as jest.Mock;
const get = tokens.get as jest.Mock;

/** A placeholder: the device was found, but it hides its token */
function placeholder() {
  const device = Object.create(Placeholder.prototype);
  Object.assign(device, {
    id: "miio:123",
    management: { address: "192.168.1.2", port: 54321 },
  });
  return device;
}

const TOKEN = Buffer.from("00112233445566778899aabbccddeeff", "hex");

describe("withSavedToken", () => {
  beforeEach(() => {
    connect.mockReset();
    get.mockReset();
  });

  test("a connected device is kept", async () => {
    const device = { id: "miio:123" };
    expect(await withSavedToken(device)).toBe(device);
    expect(get).not.toHaveBeenCalled();
  });

  test("the token of the command line wins", async () => {
    const device = placeholder();
    expect(await withSavedToken(device, "abc")).toBe(device);
    expect(get).not.toHaveBeenCalled();
  });

  test("connects again with the saved token", async () => {
    const connected = { id: "miio:123", model: "xiaomi.vacuum.d101" };
    get.mockResolvedValue(TOKEN);
    connect.mockResolvedValue(connected);
    expect(await withSavedToken(placeholder())).toBe(connected);
    expect(get).toHaveBeenCalledWith("123");
    expect(connect).toHaveBeenCalledWith({
      address: "192.168.1.2",
      port: 54321,
      token: TOKEN,
    });
  });

  test("keeps the placeholder when nothing is saved", async () => {
    const device = placeholder();
    get.mockResolvedValue(undefined);
    expect(await withSavedToken(device)).toBe(device);
    expect(connect).not.toHaveBeenCalled();
  });

  test("keeps the placeholder when the storage fails", async () => {
    const device = placeholder();
    get.mockRejectedValue(new Error("broken"));
    expect(await withSavedToken(device)).toBe(device);
  });

  test("keeps the placeholder when the saved token doesn't work", async () => {
    const device = placeholder();
    get.mockResolvedValue(TOKEN);
    connect.mockRejectedValue(new Error("invalid token"));
    expect(await withSavedToken(device)).toBe(device);
  });
});

describe("deviceFinder", () => {
  beforeEach(() => {
    connect.mockReset();
    get.mockReset();
  });

  test("by IP: uses the saved token", async () => {
    const connected = { id: "miio:123" };
    connect
      .mockResolvedValueOnce(placeholder())
      .mockResolvedValueOnce(connected);
    get.mockResolvedValue(TOKEN);
    const found = await new Promise((resolve) =>
      deviceFinder({ filter: "192.168.1.2" }).on("available", resolve),
    );
    expect(found).toBe(connected);
  });

  test("by id: uses the saved token", async () => {
    const browser = new EventEmitter();
    Object.assign(browser, {
      onAvailable: (listener: (device: unknown) => void) =>
        browser.on("available", listener),
      onUnavailable: (listener: (device: unknown) => void) =>
        browser.on("unavailable", listener),
    });
    (Devices as unknown as jest.Mock).mockImplementation(() => browser);
    const connected = { id: "miio:123" };
    connect.mockResolvedValue(connected);
    get.mockResolvedValue(TOKEN);
    const found = new Promise((resolve) =>
      deviceFinder({ filter: "123" }).on("available", resolve),
    );
    browser.emit("available", placeholder());
    expect(await found).toBe(connected);
  });
});
