import { describe, test, expect } from "vitest";

import { compose } from "../compose.js";
import { Code } from "../values.js";

import { Base, flush, record } from "./test_utils.test.mock.js";

import { SwitchableMode } from "./index.js";

describe("SwitchableMode", () => {
  class Thing extends compose(Base, SwitchableMode) {
    async changeMode(mode: string) {
      this.updateMode(mode);
    }
  }

  test("gets and sets the mode, and lists the modes", async () => {
    const thing = new Thing();
    const calls = record(thing, "modeChanged", "modesChanged");
    expect(await thing.mode()).toBeNull();
    expect(await thing.modes()).toEqual([]);
    thing.updateModes(["auto", "silent: Silent mode"]);
    expect(await thing.mode("auto")).toBe("auto");
    await flush();
    expect(calls).toEqual([
      ["modesChanged", [new Code("auto"), new Code("silent", "Silent mode")]],
      ["modeChanged", "auto"],
    ]);
  });
});
