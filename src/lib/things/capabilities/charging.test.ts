import { describe, test, expect, vi } from "vitest";

import { compose } from "../compose";

import { Base, flush, record } from "./test_utils.test.mock";

import { AutonomousCharging, BatteryLevel } from "./index";

describe("BatteryLevel and AutonomousCharging", () => {
  class Thing extends compose(Base, BatteryLevel, AutonomousCharging) {
    activateCharging = vi.fn();
  }

  test("battery level is -1 until known", async () => {
    const thing = new Thing();
    const calls = record(thing, "batteryLevelChanged");
    expect(await thing.batteryLevel()).toBe(-1);
    thing.updateBatteryLevel("80%");
    thing.updateBatteryLevel(80);
    await flush();
    expect(await thing.batteryLevel()).toBe(80);
    expect(calls).toEqual([["batteryLevelChanged", 80]]);
  });

  test("charging events and charge()", async () => {
    const thing = new Thing();
    const calls = record(
      thing,
      "chargingChanged",
      "chargingStarted",
      "chargingStopped",
    );
    expect(await thing.charging).toBe(false);
    thing.updateCharging(true);
    await flush();
    thing.updateCharging(0);
    await flush();
    expect(calls).toEqual([
      ["chargingChanged", true],
      ["chargingStarted", undefined],
      ["chargingChanged", false],
      ["chargingStopped", undefined],
    ]);
    await expect(thing.charge()).resolves.toBeNull();
    expect(thing.activateCharging).toHaveBeenCalled();
    expect(thing.matches("cap:charging-state", "cap:autonomous-charging")).toBe(
      true,
    );
  });
});
