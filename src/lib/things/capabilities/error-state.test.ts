import { describe, test, expect } from "vitest";

import { compose } from "../compose.js";
import { Code } from "../values.js";

import { Base, flush, record } from "./test_utils.test.mock.js";

import { ErrorState } from "./index.js";

describe("ErrorState", () => {
  class Thing extends compose(Base, ErrorState) {}

  test("emits errorChanged and error, then errorCleared", async () => {
    const thing = new Thing();
    const calls = record(thing, "errorChanged", "error", "errorCleared");
    expect(await thing.error).toBeNull();

    thing.updateError({ code: 10, message: "Filter blocked" });
    await flush();
    expect(calls).toEqual([
      ["errorChanged", new Code(10, "Filter blocked")],
      ["error", new Code(10, "Filter blocked")],
    ]);
    expect(await thing.error).toEqual({
      id: 10,
      description: "Filter blocked",
    });

    calls.length = 0;
    thing.updateError(null);
    thing.updateError(null);
    await flush();
    expect(calls).toEqual([
      ["errorChanged", null],
      ["errorCleared", undefined],
    ]);
  });
});
