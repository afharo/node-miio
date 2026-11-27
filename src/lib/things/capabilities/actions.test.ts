import { describe, test, expect } from "vitest";

import { compose } from "../compose";
import { Code } from "../values";

import { Base, flush, record } from "./test_utils.test.mock";

import { Actions } from "./index";

describe("Actions", () => {
  class Thing extends compose(Base, Actions) {}

  test("emits every action", async () => {
    const thing = new Thing();
    const calls = record(thing, "action", "action:click", "actionsChanged");
    thing.updateActions(["click", "double_click"]);
    thing.emitAction("click");
    thing.emitAction("click", { count: 2 });
    await flush();
    expect(calls).toEqual([
      ["actionsChanged", [new Code("click"), new Code("double_click")]],
      ["action", { action: "click", data: {} }],
      ["action:click", {}],
      ["action", { action: "click", data: { count: 2 } }],
      ["action:click", { count: 2 }],
    ]);
    expect(await thing.actions()).toEqual([
      new Code("click"),
      new Code("double_click"),
    ]);
  });
});
