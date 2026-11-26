import { compose } from "../compose";

import { Base } from "./test_utils.test.mock";

import { Nameable } from "./index";

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
