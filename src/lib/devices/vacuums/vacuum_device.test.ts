import util from "node:util";

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

import { createFakeHandle } from "../../test_utils.test.mock";
import { Device } from "../../device";
import { DeviceInfo } from "../../device_info";

import { isVacuum } from "./vacuum_device";
import { Vacuum } from "./vacuum";
import { ViomiVacuum } from "./viomivacuum";

vi.mock("debug", () => ({ default: vi.fn(() => vi.fn()) }));

describe("isVacuum", () => {
  test("is true for vacuums", () => {
    expect(
      isVacuum(new Vacuum(createFakeHandle("roborock.vacuum.s5", {}).handle)),
    ).toBe(true);
    expect(
      isVacuum(new ViomiVacuum(createFakeHandle("viomi.vacuum.v7", {}).handle)),
    ).toBe(true);
  });

  test("is false for other devices and values", () => {
    expect(
      isVacuum(new Device(createFakeHandle("zhimi.airpurifier.m1", {}).handle)),
    ).toBe(false);
    expect(isVacuum(undefined)).toBe(false);
    expect(isVacuum({})).toBe(false);
  });
});

describe("util.inspect", () => {
  test("shows the model (defined outside the class, for the published types)", () => {
    const vacuum = new Vacuum(
      createFakeHandle("roborock.vacuum.s5", {}).handle,
    );
    expect(util.inspect(vacuum, { depth: 0 })).toBe(
      "MiioDevice[roborock.vacuum.s5]",
    );
    expect(util.inspect(vacuum)).toMatch(
      /^MiioDevice \{\n {2}model=roborock\.vacuum\.s5,\n {2}types=.*vacuum/,
    );
  });
});

describe("ViomiVacuum.getSerialNumber", () => {
  test("falls back to Unknown", async () => {
    const vacuum = new ViomiVacuum(
      createFakeHandle("viomi.vacuum.v7", {}).handle,
    );
    await expect(vacuum.getSerialNumber()).resolves.toBe("Unknown");
  });
});

describe("events", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("errorChanged emits { id, description } (the shape of ErrorChangedEvent)", async () => {
    const vacuum = new Vacuum(
      createFakeHandle("roborock.vacuum.s5", {}).handle,
    );
    const errors: unknown[] = [];
    vacuum.on("errorChanged", (error: unknown) => errors.push(error));

    vacuum.setRawProperty("error_code", 10);
    vacuum.setRawProperty("state", 12); // "error"
    await vi.advanceTimersByTimeAsync(100);

    expect(errors).toEqual([{ id: 10, description: "Filter blocked" }]);
  });
});

describe("connected", () => {
  const withSocket = (socket: () => unknown) => {
    const { handle } = createFakeHandle("roborock.vacuum.s5", {});
    const parent = {
      get socket() {
        return socket();
      },
    };
    const info = new DeviceInfo(parent as never, 1234, "192.168.1.2");
    return new Vacuum({ ...handle, api: info } as never);
  };

  test("is true while the network socket is open", () => {
    expect(withSocket(() => ({})).connected).toBe(true);
  });

  test("is false once the network is destroyed (its socket getter throws)", () => {
    expect(
      withSocket(() => {
        throw new Error(
          "Network communication is unavailable, device might be destroyed",
        );
      }).connected,
    ).toBe(false);
  });
});
