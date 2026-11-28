import { describe, test, expect } from "vitest";

import { color, Color } from "./color.js";
import {
  boolean,
  code,
  Code,
  duration,
  number,
  percentage,
  percentageChange,
  temperature,
} from "./values.js";

describe("values", () => {
  test.each([
    [true, true],
    ["on", true],
    ["YES", true],
    [1, true],
    ["1", true],
    [false, false],
    ["off", false],
    ["no", false],
    [0, false],
  ])("boolean(%p) is %p", (value, expected) => {
    expect(boolean(value)).toBe(expected);
  });

  test("boolean throws for other values", () => {
    expect(() => boolean("maybe")).toThrow("Can not translate `maybe`");
  });

  test("number parses numeric strings", () => {
    expect(number(1.5)).toBe(1.5);
    expect(number(" 21.5 ")).toBe(21.5);
    expect(() => number("abc")).toThrow("invalid format");
    expect(() => number("")).toThrow("invalid format");
    expect(() => number({})).toThrow("string is needed");
  });

  test("percentage parses, clamps and rounds", () => {
    expect(percentage("50%")).toBe(50);
    expect(percentage(" 25 ")).toBe(25);
    expect(percentage(150, { max: 100 })).toBe(100);
    expect(percentage(-5, { min: 0 })).toBe(0);
    expect(percentage(33.333, { precision: 1 })).toBe(33.3);
    expect(() => percentage(null)).toThrow("Can not translate");
  });

  test("percentageChange parses increases, decreases and absolute values", () => {
    expect(percentageChange("+10")).toMatchObject({
      value: 10,
      isIncrease: true,
    });
    expect(percentageChange("-10%")).toMatchObject({
      value: 10,
      isDecrease: true,
    });
    expect(percentageChange(10)).toMatchObject({ value: 10, isSet: true });
  });

  test.each([
    [{ code: 10, message: "Filter blocked" }, new Code(10, "Filter blocked")],
    [{ id: "x", description: "X" }, new Code("x", "X")],
    [["x", "X"], new Code("x", "X")],
    ["x: The X", new Code("x", "The X")],
    ["x", new Code("x")],
    [10, new Code("10")],
  ])("code(%p)", (value, expected) => {
    expect(code(value as Parameters<typeof code>[0])).toEqual(expected);
  });

  test("duration parses milliseconds and units", () => {
    expect(duration(400).ms).toBe(400);
    expect(duration("500ms").ms).toBe(500);
    expect(duration("30s").ms).toBe(30_000);
    expect(duration("1.5m").seconds).toBe(90);
    expect(duration("1h").ms).toBe(3_600_000);
    expect(() => duration("soon")).toThrow("into a duration");
  });

  test("duration accepts surrounding whitespace and stays fast on long input", () => {
    expect(duration("  30 s  ").ms).toBe(30_000);
    expect(duration(" 500 ").ms).toBe(500);
    const start = performance.now();
    expect(() => duration(`.${" ".repeat(50_000)}x`)).toThrow(
      "into a duration",
    );
    expect(performance.now() - start).toBeLessThan(100);
  });

  test("quantities keep their value and unit", () => {
    const t = temperature("21.5");
    expect(t.value).toBe(21.5);
    expect(t.unit).toBe("°C");
    expect(Number(t)).toBe(21.5);
    expect(temperature(t)).toBe(t);
  });
});

describe("color", () => {
  test("parses temperatures, CSS colours and objects", () => {
    expect(color("4000K")).toEqual(new Color([4000], "temperature"));
    expect(color("daylight")).toEqual(new Color([5500], "temperature"));
    expect(color("#00ff00")).toEqual(new Color([0, 255, 0], "rgb"));
    expect(color("red")).toEqual(new Color([255, 0, 0], "rgb"));
    expect(color("hsl(120, 100%, 50%)")).toEqual(
      new Color([120, 100, 50], "hsl"),
    );
    expect(color({ values: [1, 2, 3], model: "rgb" })).toEqual(
      new Color([1, 2, 3], "rgb"),
    );
    expect(color([10, 20, 30])).toEqual(new Color([10, 20, 30], "rgb"));
    expect(() => color("not a colour")).toThrow("Unable to convert to color");
  });

  test("converts between RGB, HSV and HSL", () => {
    const red = color.rgb(255, 0, 0);
    expect(red.hsv.values).toEqual([0, 100, 100]);
    expect(red.hsl.values).toEqual([0, 100, 50]);
    expect(color.hsv(240, 100, 100).rgb.values).toEqual([0, 0, 255]);
    expect(color.hsl(120, 100, 25).rgb.values).toEqual([0, 128, 0]);
    expect(color.hsv(30, 50, 80).rgb.hsv.values).toEqual([30, 50, 80]);
    expect(red.hex).toBe("#ff0000");
    expect(red.red).toBe(255);
    expect(color.hsv(200, 40, 60).hue).toBe(200);
  });

  test("converts temperatures and mireds", () => {
    const warm = color.temperature(2700);
    expect(warm.kelvins).toBe(2700);
    expect(warm.mired.value).toBe(370);
    expect(color.mired(250).temperature.kelvins).toBe(4000);
    const [r, g, b] = warm.rgb.values;
    expect(r).toBe(255);
    expect(g).toBeGreaterThan(b);
    // Round trip through RGB stays close
    expect(Math.abs(warm.rgb.temperature.kelvins - 2700)).toBeLessThan(100);
    expect(color.temperature(6600).rgb.values).toEqual([255, 255, 255]);
  });

  test("component getters require the right model", () => {
    expect(() => color.rgb(1, 2, 3).kelvins).toThrow(
      "Need to convert to one of: temperature",
    );
    expect(color.rgb(1, 2, 3).is("rgb")).toBe(true);
    expect(color.rgb(1, 2, 3).as("rgb").is("rgb")).toBe(true);
  });
});
