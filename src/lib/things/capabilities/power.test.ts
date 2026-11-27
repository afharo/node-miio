import { describe, test, expect, vi } from "vitest";

import { compose } from "../compose";

import { Base, flush, record } from "./test_utils.test.mock";

import { SwitchablePower } from "./index";

describe("SwitchablePower", () => {
  class Thing extends compose(Base, SwitchablePower) {
    changePower = vi.fn(async (power: boolean) => this.updatePower(power));
  }

  test("gets, sets and toggles the power", async () => {
    const thing = new Thing();
    const calls = record(thing, "powerChanged");
    expect(await thing.power()).toBe(false);
    expect(await thing.power("on")).toBe(true);
    expect(await thing.togglePower()).toBe(false);
    expect(await thing.turnOn()).toBe(true);
    expect(thing.changePower.mock.calls).toEqual([[true], [false], [true]]);
    await flush();
    expect(calls).toEqual([["powerChanged", true]]);
    expect(thing.matches("cap:power", "cap:switchable-power")).toBe(true);
  });

  test("rejects without an implementation", async () => {
    class Unimplemented extends compose(Base, SwitchablePower) {}
    await expect(new Unimplemented().setPower(true)).rejects.toThrow(
      "changePower has not been implemented",
    );
  });
});
