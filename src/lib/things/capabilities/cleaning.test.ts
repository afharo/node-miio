import { compose } from "../compose";
import { Code } from "../values";

import { Base, flush, record } from "./test_utils.test.mock";

import { AutonomousCleaning, SpotCleaning } from "./index";

describe("cleaning", () => {
  class Thing extends compose(Base, AutonomousCleaning, SpotCleaning) {
    activateCleaning = jest.fn();
    deactivateCleaning = jest.fn();
    activateSpotClean = jest.fn();
  }

  test("emits cleaningStarted, then cleaningDone and cleaningStopped", async () => {
    const thing = new Thing();
    const calls = record(
      thing,
      "cleaningChanged",
      "cleaningStarted",
      "cleaningStopped",
      "cleaningDone",
      "cleaningError",
    );
    expect(await thing.cleaning()).toBe(false);
    thing.updateCleaning(true);
    await flush();
    thing.updateCleaning(false);
    await flush();
    expect(calls).toEqual([
      ["cleaningChanged", true],
      ["cleaningStarted", undefined],
      ["cleaningChanged", false],
      ["cleaningDone", undefined],
      ["cleaningStopped", undefined],
    ]);
  });

  test("an error stops the cleaning, with cleaningError", async () => {
    const thing = new Thing();
    thing.updateCleaning(true);
    await flush();
    const calls = record(
      thing,
      "cleaningDone",
      "cleaningError",
      "errorChanged",
    );
    thing.updateError({ code: 8, message: "Device stuck" });
    await flush();
    expect(calls).toEqual([
      ["errorChanged", new Code(8, "Device stuck")],
      ["cleaningError", new Code(8, "Device stuck")],
    ]);
    expect(await thing.cleaning()).toBe(false);
  });

  test("clean(), stop() and spotClean() call the implementations", async () => {
    const thing = new Thing();
    await expect(thing.clean()).resolves.toBeNull();
    await expect(thing.stop()).resolves.toBeNull();
    await expect(thing.spotClean()).resolves.toBeNull();
    expect(thing.activateCleaning).toHaveBeenCalled();
    expect(thing.deactivateCleaning).toHaveBeenCalled();
    expect(thing.activateSpotClean).toHaveBeenCalled();
    expect(
      thing.matches(
        "cap:error-state",
        "cap:cleaning-state",
        "cap:autonomous-cleaning",
        "cap:spot-cleaning",
      ),
    ).toBe(true);
  });
});
