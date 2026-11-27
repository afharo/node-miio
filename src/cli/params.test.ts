import { describe, test, expect } from "vitest";

import { parseArgs, parseCallParams } from "./params";

describe("parseCallParams", () => {
  test("no parameters", () => {
    expect(parseCallParams(undefined)).toEqual([]);
    expect(parseCallParams([])).toEqual([]);
  });

  test("objects are sent as objects (MIoT get_properties)", () => {
    expect(
      parseCallParams([
        '{"did":"a","siid":1,"piid":3}',
        '{"did":"b","siid":1,"piid":5}',
      ]),
    ).toEqual([
      { did: "a", siid: 1, piid: 3 },
      { did: "b", siid: 1, piid: 5 },
    ]);
  });

  test("a single JSON array is the whole list of parameters", () => {
    expect(parseCallParams(['["temperature","use_time"]'])).toEqual([
      "temperature",
      "use_time",
    ]);
  });

  test("text that isn't JSON is kept, numbers stay numbers", () => {
    expect(parseCallParams(["power", 3, "on"])).toEqual(["power", 3, "on"]);
  });

  test("a single value (not a list)", () => {
    expect(parseCallParams('{"siid":2}')).toEqual([{ siid: 2 }]);
  });
});

describe("parseArgs", () => {
  test("an array stays one argument", () => {
    expect(parseArgs(["[16,17]"])).toEqual([[16, 17]]);
  });

  test("numbers, JSON and text", () => {
    expect(parseArgs([3, "true", "Silent"])).toEqual([3, true, "Silent"]);
  });

  test("no arguments", () => {
    expect(parseArgs(undefined)).toEqual([]);
  });
});
