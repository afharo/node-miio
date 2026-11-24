import { EventEmitter } from "node:events";

jest.mock("../device-finder", () => jest.fn());
jest.mock("../log", () => ({
  log: { info: jest.fn(), plain: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const deviceFinder = require("../device-finder") as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const call = require("./protocol/call");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const control = require("./control");

/** Runs a command against a fake device, and waits for it to exit */
async function run(
  command: { handler: (argv: Record<string, unknown>) => void },
  argv: Record<string, unknown>,
  device: Record<string, unknown>,
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
});
