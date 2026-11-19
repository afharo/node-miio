import util from "node:util";

import { createFakeHandle } from "../../test_utils.test.mock";
import { Device } from "../../device";

import { isVacuum } from "./vacuum_device";
import { Vacuum } from "./vacuum";
import { ViomiVacuum } from "./viomivacuum";

jest.mock("debug", () => jest.fn().mockReturnValue(jest.fn()));

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
      /^MiioDevice \{\n {2}model=roborock\.vacuum\.s5,\n {2}types=.*vaccuum/,
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
