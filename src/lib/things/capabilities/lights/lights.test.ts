import { describe, test, expect, vi } from "vitest";

import { compose } from "../../compose.js";
import { Duration } from "../../values.js";
import { Color } from "../../color.js";
import { Base, flush, record } from "../test_utils.test.mock.js";
import {
  Colorable,
  ColorTemperature,
  Dimmable,
  Fading,
  LightBulb,
  SwitchablePower,
  type BrightnessChangeOptions,
} from "../index.js";

describe("lights", () => {
  class Thing extends compose(
    Base,
    LightBulb,
    SwitchablePower,
    Dimmable,
    Colorable,
    ColorTemperature,
    Fading,
  ) {
    changeBrightness = vi.fn(
      async (brightness: number, _options: BrightnessChangeOptions) =>
        this.updateBrightness(brightness),
    );
    changeColor = vi.fn(async (color: Color, _options: unknown) =>
      this.updateColor(color),
    );
    changePower = vi.fn();
  }

  test("types and capabilities", () => {
    const thing = new Thing();
    expect(thing.matches("type:light", "type:light-bulb")).toBe(true);
    expect(
      thing.matches(
        "cap:brightness",
        "cap:dimmable",
        "cap:colorable",
        "cap:color:temperature",
        "cap:fading",
      ),
    ).toBe(true);
  });

  test("sets, increases and decreases the brightness", async () => {
    const thing = new Thing();
    expect(await thing.brightness()).toBe(0);
    expect(await thing.brightness(50)).toBe(50);
    expect(await thing.brightness("+20")).toBe(70);
    expect(await thing.brightness("-30")).toBe(40);
    expect(await thing.increaseBrightness(80)).toBe(100);
    expect(await thing.decreaseBrightness(30)).toBe(70);
    expect(await thing.setBrightness(0)).toBe(0);
    expect(
      thing.changeBrightness.mock.calls.map(([b, o]) => [
        b,
        o.powerOn,
        o.duration.ms,
      ]),
    ).toEqual([
      [50, true, 400],
      [70, true, 400],
      [40, false, 400],
      [100, true, 400],
      [70, false, 400],
      [0, false, 400],
    ]);
  });

  test("sets the colour, with a transition", async () => {
    const thing = new Thing();
    const color = await thing.color("#ff0000", "1s");
    expect(color).toEqual(new Color([255, 0, 0], "rgb"));
    expect(thing.changeColor.mock.calls[0][1]).toEqual({
      duration: new Duration(1000),
    });
    expect(await thing.color()).toBe(color);
  });

  test("colour temperature range and max change time", async () => {
    const thing = new Thing();
    await expect(thing.colorTemperatureRange()).rejects.toThrow(
      "has not been set",
    );
    const calls = record(thing, "colorTemperatureRangeChanged");
    thing.updateColorTemperatureRange(6500, 1700);
    thing.updateColorTemperatureRange(1700, 6500);
    await flush();
    expect(await thing.colorTemperatureRange()).toEqual({
      min: 1700,
      max: 6500,
    });
    expect(calls).toEqual([
      ["colorTemperatureRangeChanged", { min: 1700, max: 6500 }],
    ]);

    thing.updateMaxChangeTime("30s");
    expect((await thing.maxChangeTime())?.ms).toBe(30_000);
  });
});
