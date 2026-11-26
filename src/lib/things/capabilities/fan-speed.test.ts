import { compose } from "../compose";

import { Base, flush, record } from "./test_utils.test.mock";

import { AdjustableFanSpeed } from "./index";

describe("AdjustableFanSpeed", () => {
  class Thing extends compose(Base, AdjustableFanSpeed) {
    changeFanSpeed = jest.fn(async (speed: number) =>
      this.updateFanSpeed(speed),
    );
  }

  test("gets and sets the fan speed", async () => {
    const thing = new Thing();
    const calls = record(thing, "fanSpeedChanged");
    expect(await thing.fanSpeed()).toBeNull();
    expect(await thing.fanSpeed("60")).toBe(60);
    expect(await thing.setFanSpeed(77)).toBe(77);
    await flush();
    expect(calls).toEqual([["fanSpeedChanged", 77]]);
    expect(thing.changeFanSpeed.mock.calls).toEqual([[60], [77]]);
  });
});
