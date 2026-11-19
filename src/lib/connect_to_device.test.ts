import path from "node:path";

import { connectToDevice } from "./connect_to_device";
import { network } from "./network";
import { configureMiotSpecs } from "./miot/spec_client";
import { DreameVacuum } from "./devices/vacuums/dreamevacuum";
import { MiotVacuum } from "./devices/vacuums/miot-vacuum";
import { Vacuum } from "./devices/vacuums/vacuum";
import { ViomiVacuum } from "./devices/vacuums/viomivacuum";
import { MijiaVacuum } from "./devices/vacuums/mijiavacuum";

jest.mock("debug", () => jest.fn().mockReturnValue(jest.fn()));

type GetPropertiesResponder = (
  props: Array<{ did: string; siid: number; piid: number }>,
) => unknown;

function mockDevice(model: string, getProperties?: GetPropertiesResponder) {
  const call = jest.fn(async (method: string, params: unknown) => {
    switch (method) {
      case "get_properties":
        if (!getProperties) throw new Error("unknown method");
        return getProperties(params as never);
      case "get_status":
      case "get_consumable":
        return [{}];
      case "get_prop":
        return (params as unknown[]).map(() => 0);
      default:
        throw new Error(`Unexpected call ${method}`);
    }
  });
  jest.spyOn(network, "findDeviceViaAddress").mockResolvedValue({
    id: 1,
    model,
    call,
  } as never);
  return call;
}

const respondOk: GetPropertiesResponder = (props) =>
  props.map((p) => ({ ...p, code: 0, value: 1 }));

beforeAll(() => {
  configureMiotSpecs({
    offline: true,
    cacheDir: false,
    specDir: path.join(__dirname, "__fixtures__", "miot"),
    snapshotPath: path.join(__dirname, "__fixtures__", "missing.json.gz"),
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function connect() {
  const device = await connectToDevice({ address: "192.168.1.10" });
  if (!device) throw new Error("No device returned");
  // Stop polling
  await device.destroy();
  return device;
}

describe("connectToDevice", () => {
  test.each([
    ["roborock.vacuum.s5", Vacuum],
    ["roborock.vacuum.a72", Vacuum], // not in models.ts, resolved by the vacuum fallback
    ["rockrobo.vacuum.v1", Vacuum],
    ["roborock.vacuum.m1s", MijiaVacuum],
    ["viomi.vacuum.v8", ViomiVacuum],
    ["viomi.vacuum.v7", ViomiVacuum],
    // Not pinned in models.ts, but its spec is a placeholder
    ["viomi.vacuum.v10", ViomiVacuum],
    ["dreame.vacuum.mc1808", DreameVacuum],
  ])("%s uses the legacy miIO class", async (model, expected) => {
    // Even if they answer get_properties, legacy brands are not routed to MIoT
    mockDevice(model, respondOk);
    await expect(connect()).resolves.toBeInstanceOf(expected);
  });

  test.each([
    "xiaomi.vacuum.d110ch",
    "dreame.vacuum.p2008",
    "mijia.vacuum.v2",
    "ijai.vacuum.v3",
    "viomi.vacuum.v18",
  ])("%s uses the spec-driven MiotVacuum", async (model) => {
    mockDevice(model, respondOk);
    await expect(connect()).resolves.toBeInstanceOf(MiotVacuum);
  });

  test("falls back to the previous classes when the device doesn't answer get_properties", async () => {
    mockDevice("dreame.vacuum.p2008");
    await expect(connect()).resolves.toBeInstanceOf(DreameVacuum);

    mockDevice("xiaomi.vacuum.d110ch");
    await expect(connect()).resolves.toBeInstanceOf(Vacuum);

    mockDevice("viomi.vacuum.v18");
    await expect(connect()).resolves.toBeInstanceOf(ViomiVacuum);
  });

  test("falls back when the status property is not available", async () => {
    mockDevice("xiaomi.vacuum.d110ch", (props) =>
      props.map((p) => ({ ...p, code: -4001 })),
    );
    const device = await connect();
    expect(device).toBeInstanceOf(Vacuum);
    expect(device).not.toBeInstanceOf(MiotVacuum);
  });

  test("falls back when there's no spec for the model", async () => {
    mockDevice("unknown.vacuum.model", respondOk);
    const device = await connect();
    expect(device).toBeInstanceOf(Vacuum);
    expect(device).not.toBeInstanceOf(MiotVacuum);
  });
});
