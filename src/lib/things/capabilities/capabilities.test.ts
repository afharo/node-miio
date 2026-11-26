import { compose } from "../compose";
import { MiioThing } from "../thing";
import { Code, Duration } from "../values";
import { Color } from "../color";

import {
  Actions,
  AutonomousCharging,
  BatteryLevel,
  ErrorState,
  Nameable,
  SwitchableMode,
  SwitchablePower,
} from "./common";
import {
  AdjustableFanSpeed,
  AdjustableTargetHumidity,
  AutonomousCleaning,
  SpotCleaning,
} from "./climate";
import { Children, ChildSyncer } from "./children";
import { Contact, Motion, RelativeHumidity, Temperature } from "./sensors";
import {
  Colorable,
  ColorTemperature,
  Dimmable,
  Fading,
  LightBulb,
  type BrightnessChangeOptions,
} from "./lights";

const flush = () => new Promise((resolve) => setImmediate(resolve));

class Base extends MiioThing {
  constructor(id = "test:1") {
    super();
    this.id = id;
  }
}

/**
 * Records the events emitted by a thing.
 *
 * @param thing The thing
 * @param events The events to record
 * @returns The recorded `[event, data]`
 */
function record(thing: MiioThing, ...events: string[]) {
  const calls: [string, unknown][] = [];
  for (const event of events) {
    thing.on(event, (data: unknown) => calls.push([event, data]));
  }
  return calls;
}

describe("capabilities", () => {
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

  describe("SwitchablePower", () => {
    class Thing extends compose(Base, SwitchablePower) {
      changePower = jest.fn(async (power: boolean) => this.updatePower(power));
    }

    test("gets, sets and toggles the power", async () => {
      const thing = new Thing();
      const calls = record(thing, "powerChanged");
      expect(await thing.power()).toBe(false);
      expect(await thing.power("on")).toBe(true);
      expect(await thing.togglePower()).toBe(false);
      expect(await thing.turnOn()).toBe(true);
      expect(thing.changePower.mock.calls).toEqual([[true], [false], [true]]);
      await flush();
      expect(calls).toEqual([["powerChanged", true]]);
      expect(thing.matches("cap:power", "cap:switchable-power")).toBe(true);
    });

    test("rejects without an implementation", async () => {
      class Unimplemented extends compose(Base, SwitchablePower) {}
      await expect(new Unimplemented().setPower(true)).rejects.toThrow(
        "changePower has not been implemented",
      );
    });
  });

  describe("SwitchableMode", () => {
    class Thing extends compose(Base, SwitchableMode) {
      async changeMode(mode: string) {
        this.updateMode(mode);
      }
    }

    test("gets and sets the mode, and lists the modes", async () => {
      const thing = new Thing();
      const calls = record(thing, "modeChanged", "modesChanged");
      expect(await thing.mode()).toBeNull();
      expect(await thing.modes()).toEqual([]);
      thing.updateModes(["auto", "silent: Silent mode"]);
      expect(await thing.mode("auto")).toBe("auto");
      await flush();
      expect(calls).toEqual([
        ["modesChanged", [new Code("auto"), new Code("silent", "Silent mode")]],
        ["modeChanged", "auto"],
      ]);
    });
  });

  describe("BatteryLevel and AutonomousCharging", () => {
    class Thing extends compose(Base, BatteryLevel, AutonomousCharging) {
      activateCharging = jest.fn();
    }

    test("battery level is -1 until known", async () => {
      const thing = new Thing();
      const calls = record(thing, "batteryLevelChanged");
      expect(await thing.batteryLevel()).toBe(-1);
      thing.updateBatteryLevel("80%");
      thing.updateBatteryLevel(80);
      await flush();
      expect(await thing.batteryLevel()).toBe(80);
      expect(calls).toEqual([["batteryLevelChanged", 80]]);
    });

    test("charging events and charge()", async () => {
      const thing = new Thing();
      const calls = record(
        thing,
        "chargingChanged",
        "chargingStarted",
        "chargingStopped",
      );
      expect(await thing.charging).toBe(false);
      thing.updateCharging(true);
      await flush();
      thing.updateCharging(0);
      await flush();
      expect(calls).toEqual([
        ["chargingChanged", true],
        ["chargingStarted", undefined],
        ["chargingChanged", false],
        ["chargingStopped", undefined],
      ]);
      await expect(thing.charge()).resolves.toBeNull();
      expect(thing.activateCharging).toHaveBeenCalled();
      expect(
        thing.matches("cap:charging-state", "cap:autonomous-charging"),
      ).toBe(true);
    });
  });

  describe("cleaning", () => {
    class Thing extends compose(Base, AutonomousCleaning, SpotCleaning) {
      activateCleaning = jest.fn();
      deactivateCleaning = jest.fn();
      activateSpotClean = jest.fn();
    }

    test("emits cleaningStarted, then cleaningDone and cleaningStopped", async () => {
      const thing = new Thing();
      const calls = record(
        thing,
        "cleaningChanged",
        "cleaningStarted",
        "cleaningStopped",
        "cleaningDone",
        "cleaningError",
      );
      expect(await thing.cleaning()).toBe(false);
      thing.updateCleaning(true);
      await flush();
      thing.updateCleaning(false);
      await flush();
      expect(calls).toEqual([
        ["cleaningChanged", true],
        ["cleaningStarted", undefined],
        ["cleaningChanged", false],
        ["cleaningDone", undefined],
        ["cleaningStopped", undefined],
      ]);
    });

    test("an error stops the cleaning, with cleaningError", async () => {
      const thing = new Thing();
      thing.updateCleaning(true);
      await flush();
      const calls = record(
        thing,
        "cleaningDone",
        "cleaningError",
        "errorChanged",
      );
      thing.updateError({ code: 8, message: "Device stuck" });
      await flush();
      expect(calls).toEqual([
        ["errorChanged", new Code(8, "Device stuck")],
        ["cleaningError", new Code(8, "Device stuck")],
      ]);
      expect(await thing.cleaning()).toBe(false);
    });

    test("clean(), stop() and spotClean() call the implementations", async () => {
      const thing = new Thing();
      await expect(thing.clean()).resolves.toBeNull();
      await expect(thing.stop()).resolves.toBeNull();
      await expect(thing.spotClean()).resolves.toBeNull();
      expect(thing.activateCleaning).toHaveBeenCalled();
      expect(thing.deactivateCleaning).toHaveBeenCalled();
      expect(thing.activateSpotClean).toHaveBeenCalled();
      expect(
        thing.matches(
          "cap:error-state",
          "cap:cleaning-state",
          "cap:autonomous-cleaning",
          "cap:spot-cleaning",
        ),
      ).toBe(true);
    });
  });

  describe("AdjustableFanSpeed", () => {
    class Thing extends compose(Base, AdjustableFanSpeed) {
      changeFanSpeed = jest.fn(async (speed: number) =>
        this.updateFanSpeed(speed),
      );
    }

    test("gets and sets the fan speed", async () => {
      const thing = new Thing();
      const calls = record(thing, "fanSpeedChanged");
      expect(await thing.fanSpeed()).toBeNull();
      expect(await thing.fanSpeed("60")).toBe(60);
      expect(await thing.setFanSpeed(77)).toBe(77);
      await flush();
      expect(calls).toEqual([["fanSpeedChanged", 77]]);
      expect(thing.changeFanSpeed.mock.calls).toEqual([[60], [77]]);
    });
  });

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

  describe("Children", () => {
    class Parent extends compose(Base, Children) {}
    class Child extends MiioThing {
      constructor(id: string) {
        super();
        this.id = id;
      }
    }

    test("adds, replaces, finds and removes children", async () => {
      const parent = new Parent("gateway:1");
      const calls = record(parent, "thing:available", "thing:unavailable");
      const a = new Child("gateway:1:a");
      const a2 = new Child("gateway:1:a");

      parent.addChild(a);
      parent.addChild(a);
      expect(a.metadata.parent).toBe(parent);
      expect(a.matches("type:sub-thing")).toBe(true);
      expect(parent.hasChild("a")).toBe(true);
      expect(parent.child("gateway:1:a")).toBe(a);

      parent.addChild(a2);
      expect(parent.child("a")).toBe(a2);
      expect(parent.findChild((c) => c === a2)).toBe(a2);
      expect([...parent.children()]).toEqual([a2]);

      parent.removeChild("a");
      expect(parent.hasChild(a2)).toBe(false);
      await flush();
      expect(calls).toEqual([
        ["thing:available", a],
        ["thing:unavailable", a],
        ["thing:available", a2],
        ["thing:unavailable", a2],
      ]);
    });

    test("ChildSyncer creates, keeps and destroys children", async () => {
      const parent = new Parent("gateway:1");
      const created: string[] = [];
      const syncer = new ChildSyncer<{ id: string; keep?: boolean }>(
        parent,
        (def, existing) => {
          if (existing) return def.keep === false ? null : existing;
          created.push(def.id);
          return new Child(`gateway:1:${def.id}`);
        },
      );

      await syncer.update([{ id: "a" }, { id: "b" }]);
      expect(created).toEqual(["a", "b"]);
      expect([...parent.children()].map((c) => c.id)).toEqual([
        "gateway:1:a",
        "gateway:1:b",
      ]);

      // "a" is kept, "b" is gone, "c" is new
      await syncer.update([{ id: "a" }, { id: "c" }]);
      await flush();
      expect(created).toEqual(["a", "b", "c"]);
      expect([...parent.children()].map((c) => c.id).sort()).toEqual([
        "gateway:1:a",
        "gateway:1:c",
      ]);

      // The sync function can destroy an existing child
      await syncer.update([{ id: "a", keep: false }, { id: "c" }]);
      await flush();
      expect([...parent.children()].map((c) => c.id)).toEqual(["gateway:1:c"]);
    });
  });

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
      changeBrightness = jest.fn(
        async (brightness: number, _options: BrightnessChangeOptions) =>
          this.updateBrightness(brightness),
      );
      changeColor = jest.fn(async (color: Color, _options: unknown) =>
        this.updateColor(color),
      );
      changePower = jest.fn();
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
});
