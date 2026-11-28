import { EventEmitter } from "node:events";

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";

import { log } from "../log.js";
import { createFakeHandle } from "../../lib/test_utils.test.mock.js";
import { Vacuum } from "../../lib/devices/vacuums/vacuum.js";
import { deviceFinder } from "../device-finder.js";

import * as inspectCommand from "./inspect.js";
import * as callCommand from "./protocol/call.js";
import * as controlCommand from "./control.js";
import * as configureCommand from "./configure.js";
import * as tokensUpdateCommand from "./tokens/update.js";

vi.mock("../device-finder.js", () => ({ deviceFinder: vi.fn() }));
vi.mock("../log.js", () => ({
  log: {
    info: vi.fn(),
    plain: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    device: vi.fn(),
    group: vi.fn((print: () => void) => print()),
  },
}));

const mockedFinder = deviceFinder as Mock;

/** The commands type their argv: the tests pass any argv to every command */
type AnyCommand = {
  handler: (argv: Record<string, unknown>) => void;
  builder: Record<string, unknown>;
};
const inspect = inspectCommand as unknown as AnyCommand;
const call = callCommand as unknown as AnyCommand;
const control = controlCommand as unknown as AnyCommand;
const configure = configureCommand as unknown as AnyCommand;
const tokensUpdate = tokensUpdateCommand as unknown as AnyCommand;

/** Runs a command against a fake device, and waits for it to exit */
async function run(
  command: { handler: (argv: Record<string, unknown>) => void },
  argv: Record<string, unknown>,
  device: object,
) {
  const browser = new EventEmitter();
  mockedFinder.mockReturnValue(browser);
  const exited = new Promise<void>((resolve) => {
    vi.spyOn(process, "exit").mockImplementation((() => {
      resolve();
    }) as never);
  });
  command.handler(argv);
  browser.emit("available", device);
  await exited;
}

describe("CLI commands", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  test("protocol call sends JSON parameters as objects, with the token", async () => {
    const miioCall = vi.fn().mockResolvedValue([{ code: 0, value: "SN" }]);
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
    expect(mockedFinder).toHaveBeenCalledWith({
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
    const printed = vi
      .mocked(log.plain)
      .mock.calls.map((args) => args.join(" "));
    expect(printed).toContain("Firmware version: 3.5.8_0950");
    expect(printed).toContain("Remote access (Mi Home App): UDP");
    expect(printed).toContain("  - batteryLevel: 42");
    // The actions it supports, grouped
    expect(printed).toContain(
      "Actions: (node-miio control <device> <action> [args])",
    );
    expect(printed).toContain(
      "Cleaning - cap:cleaning-state, cap:autonomous-cleaning, cap:spot-cleaning",
    );
    expect(printed).toContain("setFanSpeed number - Changes the fan speed");
    expect(printed).toContain(
      "cleanRooms number[] [object] - Cleans the given rooms (segment ids from getRoomMap)",
    );
    expect(printed).toContain(
      "miioCall string [array] - Calls a miIO method (see protocol call)",
    );
  });

  test("protocol call goes through the gateway for sub-devices (no miioCall)", async () => {
    const subDeviceCall = vi.fn().mockResolvedValue(["ok"]);
    await run(
      call,
      { idOrIp: "lumi.158d0001", method: "read", params: ["[1]"] },
      { call: subDeviceCall },
    );
    expect(subDeviceCall).toHaveBeenCalledWith("read", [1]);
    expect(process.exitCode).toBeUndefined();
  });

  test("control passes the token and the parsed arguments", async () => {
    const cleanRooms = vi.fn().mockResolvedValue("ok");
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
    expect(mockedFinder).toHaveBeenCalledWith({
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
    mockedFinder.mockReturnValue(new EventEmitter());
    command.handler({ idOrIp: "192.168.1.2", token: "abc", ...extra });
    expect(mockedFinder).toHaveBeenCalledWith(
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
        { changeFanSpeed: vi.fn().mockResolvedValue(undefined) },
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
          changeFanSpeed: vi.fn().mockRejectedValue(new Error("code -4005")),
        },
      ],
      ["control: unknown method", control, { method: "nope", params: [] }, {}],
      [
        "protocol call: the call fails",
        call,
        { method: "get_properties", params: [] },
        { miioCall: vi.fn().mockRejectedValue(new Error("timeout")) },
      ],
      [
        "inspect: the device can't be read",
        inspect,
        {},
        {
          management: { info: vi.fn().mockRejectedValue(new Error("x")) },
        },
      ],
      [
        "configure: the WiFi can't be set",
        configure,
        { ssid: "wifi", passwd: "secret" },
        {
          management: {
            updateWireless: vi.fn().mockRejectedValue(new Error("x")),
          },
        },
      ],
      [
        "tokens update: the token doesn't work",
        tokensUpdate,
        { token: "abc" },
        { management: { updateToken: vi.fn().mockResolvedValue(false) } },
      ],
      [
        "tokens update: the update fails",
        tokensUpdate,
        { token: "abc" },
        {
          management: {
            updateToken: vi.fn().mockRejectedValue(new Error("x")),
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
      mockedFinder.mockReturnValue(browser);
      const exited = new Promise<void>((resolve) => {
        vi.spyOn(process, "exit").mockImplementation((() => {
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
