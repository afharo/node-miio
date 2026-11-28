import { describe, test, expect } from "vitest";

import { compose } from "../compose.js";

import { Base } from "./test_utils.test.mock.js";

import { Nameable } from "./index.js";

describe("Nameable", () => {
  class Thing extends compose(Base, Nameable) {
    async changeName(name: string) {
      this.metadata.name = name;
    }
  }

  test("setName changes the name", async () => {
    await expect(new Thing().setName("Robot")).resolves.toBe("Robot");
  });
});
