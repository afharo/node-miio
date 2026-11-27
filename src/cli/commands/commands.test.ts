import { EventEmitter } from "node:events";

import { log } from "../log";
import { createFakeHandle } from "../../lib/test_utils.test.mock";
import { Vacuum } from "../../lib/devices/vacuums/vacuum";

jest.mock("../device-finder", () => jest.fn());
jest.mock("../log", () => ({
  log: {
    info: jest.fn(),
    plain: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    device: jest.fn(),
    group: jest.fn((print: () => void) => print()),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const deviceFinder = require("../device-finder") as jest.Mock;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const call = require("./protocol/call");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const control = require("./control");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const inspect = require("./inspect");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const configure = require("./configure");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokensUpdate = require("./tokens/update");

/** Runs a command against a fake device, and waits for it to exit */
async function run(
  command: { handler: (argv: Record<string, unknown>) => void },
  argv: Record<string, unknown>,
  device: object,
) {
  const browser = new EventEmitter();
  deviceFinder.mockReturnValue(browser);
  const exited = new Promise<void>((resolve) => {
    jest.spyOn(process, "exit").mockImplementation((() => {
      resolve();
    }) as never);
  });
  command.handler(argv);
  browser.emit("available", device);
  await exited;
}

describe("CLI commands", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.exitCode = undefined;
  });

  test("protocol call sends JSON parameters as objects, with the token", async () => {
    const miioCall = jest.fn().mockResolvedValue([{ code: 0, value: "SN" }]);
    await run(
      call,
      {
        idOrIp: "192.168.1.2",
        method: "get_properties",
        params: ['{"did":"serial","siid":1,"piid":3}'],
        token: "abc",
      },
      { miioCall },
    );
    expect(deviceFinder).toHaveBeenCalledWith({
      filter: "192.168.1.2",
      token: "abc",
    });
    expect(miioCall).toHaveBeenCalledWith("get_properties", [
      { did: "serial", siid: 1, piid: 3 },
    ]);
  });

  test("inspect prints a real device, with its info, properties and capabilities", async () => {
    const { handle } = createFakeHandle("roborock.vacuum.s5", {
      "miIO.info": {
        fw_ver: "3.5.8_0950",
        hw_ver: "Linux",
        ap: { ssid: "home", bssid: "AA:BB", rssi: -50 },
        ot: "otu",
      },
    });
    const vacuum = new Vacuum(handle);
    vacuum.setRawProperty("battery", 42);
    await run(inspect, { idOrIp: "192.168.1.2" }, vacuum);

    expect(log.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    expect(log.device).toHaveBeenCalledWith(vacuum, true);
    const printed = jest
      .mocked(log.plain)
      .mock.calls.map((args) => args.join(" "));
    expect(printed).toContain("Firmware version: 3.5.8_0950");
    expect(printed).toContain("Remote access (Mi Home App): UDP");
    expect(printed).toContain("  - batteryLevel: 42");
  });

  test("control passes the token and the parsed arguments", async () => {
    const cleanRooms = jest.fn().mockResolvedValue("ok");
    await run(
      control,
      {
        idOrIp: "192.168.1.2",
        method: "cleanRooms",
        params: ["[16,17]"],
        token: "abc",
      },
      { cleanRooms },
    );
    expect(deviceFinder).toHaveBeenCalledWith({
      filter: "192.168.1.2",
      token: "abc",
    });
    expect(cleanRooms).toHaveBeenCalledWith([16, 17]);
  });

  test.each([
    ["inspect", inspect, {}],
    ["configure", configure, { ssid: "wifi", passwd: "secret" }],
    ["tokens update", tokensUpdate, {}],
  ])("%s connects with the token", (_name, command, extra) => {
    deviceFinder.mockReturnValue(new EventEmitter());
    command.handler({ idOrIp: "192.168.1.2", token: "abc", ...extra });
    expect(deviceFinder).toHaveBeenCalledWith(
      expect.objectContaining({ filter: "192.168.1.2", token: "abc" }),
    );
  });

  test.each([
    ["inspect", inspect],
    ["configure", configure],
  ])("%s has a --token option", (_name, command) => {
    expect(command.builder.token).toEqual(
      expect.objectContaining({ type: "string" }),
    );
  });

  describe("exit code", () => {
    test("control succeeds, and prints nothing for a method without a result", async () => {
      await run(
        control,
        { idOrIp: "192.168.1.2", method: "changeFanSpeed", params: [3] },
        { changeFanSpeed: jest.fn().mockResolvedValue(undefined) },
      );
      expect(process.exitCode).toBeUndefined();
      expect(log.plain).not.toHaveBeenCalledWith(undefined);
    });

    test.each([
      [
        "control: the method fails",
        control,
        { method: "changeFanSpeed", params: [3] },
        {
          changeFanSpeed: jest.fn().mockRejectedValue(new Error("code -4005")),
        },
      ],
      ["control: unknown method", control, { method: "nope", params: [] }, {}],
      [
        "protocol call: the call fails",
        call,
        { method: "get_properties", params: [] },
        { miioCall: jest.fn().mockRejectedValue(new Error("timeout")) },
      ],
      [
        "inspect: the device can't be read",
        inspect,
        {},
        {
          management: { info: jest.fn().mockRejectedValue(new Error("x")) },
        },
      ],
      [
        "configure: the WiFi can't be set",
        configure,
        { ssid: "wifi", passwd: "secret" },
        {
          management: {
            updateWireless: jest.fn().mockRejectedValue(new Error("x")),
          },
        },
      ],
      [
        "tokens update: the token doesn't work",
        tokensUpdate,
        { token: "abc" },
        { management: { updateToken: jest.fn().mockResolvedValue(false) } },
      ],
      [
        "tokens update: the update fails",
        tokensUpdate,
        { token: "abc" },
        {
          management: {
            updateToken: jest.fn().mockRejectedValue(new Error("x")),
          },
        },
      ],
    ])("%s fails", async (_name, command, argv, device) => {
      await run(command, { idOrIp: "192.168.1.2", ...argv }, device);
      expect(process.exitCode).toBe(1);
    });

    test.each([
      ["control", control, { method: "find", params: [] }],
      ["protocol call", call, { method: "miIO.info", params: [] }],
      ["inspect", inspect, {}],
      ["configure", configure, { ssid: "wifi", passwd: "secret" }],
      ["tokens update", tokensUpdate, { token: "abc" }],
    ])("%s fails when the device isn't found", async (_name, command, argv) => {
      const browser = new EventEmitter();
      deviceFinder.mockReturnValue(browser);
      const exited = new Promise<void>((resolve) => {
        jest.spyOn(process, "exit").mockImplementation((() => {
          resolve();
        }) as never);
      });
      command.handler({ idOrIp: "192.168.1.2", ...argv });
      browser.emit("done");
      await exited;
      expect(process.exitCode).toBe(1);
    });
  });
});
