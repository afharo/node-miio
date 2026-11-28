import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, test, expect, afterEach, beforeAll, vi } from "vitest";

import { connectToDevice } from "./connect_to_device.js";
import { network } from "./network.js";
import { configureMiotSpecs } from "./miot/spec_client.js";
import { DreameVacuum } from "./devices/vacuums/dreamevacuum.js";
import { MiotVacuum } from "./devices/vacuums/miot-vacuum.js";
import { Vacuum } from "./devices/vacuums/vacuum.js";
import { ViomiVacuum } from "./devices/vacuums/viomivacuum.js";
import { MiioError } from "./miio_error.js";
import { Device } from "./device.js";
import { Placeholder } from "./placeholder.js";
import { MijiaVacuum } from "./devices/vacuums/mijiavacuum.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

vi.mock("debug", () => ({ default: vi.fn(() => vi.fn()) }));

type GetPropertiesResponder = (
  props: Array<{ did: string; siid: number; piid: number }>,
) => unknown;

function mockDevice(model: string, getProperties?: GetPropertiesResponder) {
  const call = vi.fn(async (method: string, params: unknown) => {
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
  vi.spyOn(network, "findDeviceViaAddress").mockResolvedValue({
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
    specDir: path.join(moduleDir, "__fixtures__", "miot"),
    snapshotPath: path.join(moduleDir, "__fixtures__", "missing.json.gz"),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
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

describe("connectToDevice errors and generic devices", () => {
  test("uses the generic device for models it doesn't know", async () => {
    mockDevice("acme.gadget.v1");
    const device = await connect();
    expect(device).toBeInstanceOf(Device);
    expect(device.constructor).toBe(Device);
  });

  test.each(["missing-token", "connection-failure"] as const)(
    "returns a placeholder on %s when asked to",
    async (code) => {
      const failure = new MiioError("nope", code);
      Object.assign(failure, { device: { id: 7, model: null, call: vi.fn() } });
      vi.spyOn(network, "findDeviceViaAddress").mockRejectedValue(failure);

      const device = await connectToDevice({
        address: "192.168.1.10",
        withPlaceholder: true,
      });
      expect(device).toBeInstanceOf(Placeholder);
      await device.destroy();
    },
  );

  test("rethrows the error, releasing the network, otherwise", async () => {
    const release = vi.fn();
    vi.spyOn(network, "ref").mockReturnValue({ release });
    const failure = new MiioError("nope", "missing-token");
    Object.assign(failure, { device: { id: 7 } });
    vi.spyOn(network, "findDeviceViaAddress").mockRejectedValue(failure);

    // Without withPlaceholder
    await expect(connectToDevice({ address: "192.168.1.10" })).rejects.toBe(
      failure,
    );
    expect(release).toHaveBeenCalledOnce();
    // The device the error carries is not leaked to the caller
    expect(
      (failure as MiioError & { device?: unknown }).device,
    ).toBeUndefined();

    // Other errors, even with withPlaceholder
    release.mockClear();
    const other = new Error("boom");
    vi.mocked(network.findDeviceViaAddress).mockRejectedValue(other);
    await expect(
      connectToDevice({ address: "192.168.1.10", withPlaceholder: true }),
    ).rejects.toBe(other);
    expect(release).toHaveBeenCalledOnce();
  });
});
