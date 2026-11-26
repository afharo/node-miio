import { compose } from "../compose";

import { Base, flush, record } from "./test_utils.test.mock";

import { Contact, Motion, RelativeHumidity, Temperature } from "./index";

describe("sensors", () => {
  class Thing extends compose(
    Base,
    Temperature,
    RelativeHumidity,
    Contact,
    Motion,
  ) {}

  test("updates the values and lists the sensor types", async () => {
    const thing = new Thing();
    const calls = record(
      thing,
      "temperatureChanged",
      "relativeHumidityChanged",
    );
    thing.updateTemperature(21.5);
    thing.updateRelativeHumidity("40");
    await flush();
    expect(calls.map(([e, d]) => [e, Number(d)])).toEqual([
      ["temperatureChanged", 21.5],
      ["relativeHumidityChanged", 40],
    ]);
    expect(String(await thing.temperature())).toBe("21.5 °C");
    expect(thing.sensorTypes).toEqual([
      "temperature",
      "relativeHumidity",
      "contact",
      "motion",
    ]);
    expect(Object.keys(await thing.values())).toEqual(thing.sensorTypes);
    expect(thing.matches("type:sensor", "cap:temperature")).toBe(true);
  });

  test("contact emits opened and closed", async () => {
    const thing = new Thing();
    const calls = record(thing, "opened", "closed");
    thing.updateContact(true);
    await flush();
    expect(await thing.isClosed()).toBe(true);
    thing.updateContact(false);
    await flush();
    expect(await thing.isOpen()).toBe(true);
    expect(calls.map(([e]) => e)).toEqual(["closed", "opened"]);
  });

  test("motion goes back to idle after the timeout", async () => {
    jest.useFakeTimers();
    try {
      const thing = new Thing();
      thing.updateMotion(true, "1m");
      expect(await thing.motion()).toBe(true);
      await jest.advanceTimersByTimeAsync(59_000);
      expect(await thing.motion()).toBe(true);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(await thing.motion()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
