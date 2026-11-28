import { describe, test, expect } from "vitest";

import { isSameValue } from "./same_value.js";

describe("isSameValue", () => {
  test("treats null and undefined as the same (missing) value", () => {
    expect(isSameValue(undefined, undefined)).toBe(true);
    expect(isSameValue(undefined, null)).toBe(true);
    expect(isSameValue(null, undefined)).toBe(true);
  });

  test("a missing value differs from a falsy one", () => {
    expect(isSameValue(undefined, 0)).toBe(false);
    expect(isSameValue(null, false)).toBe(false);
    expect(isSameValue(undefined, "")).toBe(false);
  });

  test("compares primitives strictly", () => {
    expect(isSameValue(1, 1)).toBe(true);
    expect(isSameValue("on", "on")).toBe(true);
    expect(isSameValue(1, 2)).toBe(false);
    expect(isSameValue(1, "1")).toBe(false);
    expect(isSameValue(Number.NaN, Number.NaN)).toBe(true);
  });

  test("compares objects and arrays deeply", () => {
    expect(isSameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(isSameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(isSameValue([1, 2], [2, 1])).toBe(false);
    expect(isSameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});
