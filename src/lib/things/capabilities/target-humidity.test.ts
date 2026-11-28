import { describe, test, expect } from "vitest";

import { compose } from "../compose.js";

import { Base } from "./test_utils.test.mock.js";

import { AdjustableTargetHumidity } from "./index.js";

describe("AdjustableTargetHumidity", () => {
  class Thing extends compose(Base, AdjustableTargetHumidity) {
    async changeTargetHumidity(humidity: number) {
      this.updateTargetHumidity(humidity);
    }
  }

  test("gets and sets the target humidity", async () => {
    const thing = new Thing();
    expect(await thing.targetHumidity()).toBeNull();
    expect(await thing.targetHumidity(50)).toBe(50);
    expect(
      thing.matches("cap:target-humidity", "cap:adjustable-target-humidity"),
    ).toBe(true);
  });
});
