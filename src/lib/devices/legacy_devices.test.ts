import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

import { createFakeHandle, sentCalls } from "../test_utils.test.mock.js";
import { Device } from "../device.js";
import { Color } from "../things/color.js";

import { AirMonitor } from "./air-monitor.js";
import { AirPurifier } from "./air-purifier.js";
import { PowerPlugChuangmiV1 } from "./chuangmi.plug.v1.js";
import { EyecareLamp2 } from "./eyecare-lamp2.js";
import { Humidifier } from "./humidifier.js";
import { PhilipsLightBulb } from "./philips-light-bulb.js";
import { PowerPlug } from "./power-plug.js";
import { PowerStrip } from "./power-strip.js";
import { YeelightColor } from "./yeelight.color.js";
import { YeelightMono } from "./yeelight.mono.js";

vi.mock("debug", () => ({ default: vi.fn(() => vi.fn()) }));

/** Waits for the queued events to be emitted */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * A `get_prop` response with the given raw values.
 *
 * @param values The raw values, by property
 * @returns The response handler
 */
function getProp(values: Record<string, unknown>) {
  return (props: unknown) => (props as string[]).map((p) => values[p]);
}

/**
 * Creates a device that replays the given responses, and loads its properties.
 *
 * @param DeviceClass The device class
 * @param model The model
 * @param props The raw values of `get_prop`
 * @param responses Other responses
 * @returns The device and the mocked call
 */
async function loaded<T extends Device>(
  DeviceClass: new (handle: ConstructorParameters<typeof Device>[0]) => T,
  model: string,
  props: Record<string, unknown>,
  responses: Record<string, unknown> = {},
) {
  const { handle, call } = createFakeHandle(model, {
    get_prop: getProp(props),
    ...responses,
  });
  const device = new DeviceClass(handle);
  await device.poll();
  await flush();
  call.mockClear();
  return { device, call };
}

describe("Device polling", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("init polls once, then every 30 seconds", async () => {
    const { handle, call } = createFakeHandle("chuangmi.plug.m1", {
      get_prop: getProp({ power: "on" }),
    });
    const plug = new PowerPlug(handle);
    await plug.init();
    expect(call).toHaveBeenCalledTimes(1);
    expect(await plug.power()).toBe(true);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(call).toHaveBeenCalledTimes(2);
    await plug.destroy();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(call).toHaveBeenCalledTimes(2);
    expect(handle.ref.release).toHaveBeenCalled();
  });

  test("the device is destroyed after 10 failed polls in a row", async () => {
    let fail = false;
    const { handle } = createFakeHandle("chuangmi.plug.m1", {
      get_prop: (props: unknown) => {
        if (fail) throw new Error("timeout");
        return getProp({ power: "on" })(props);
      },
    });
    const plug = new PowerPlug(handle);
    const destroyed = vi.fn();
    plug.on("thing:destroyed", destroyed);
    await plug.init();

    fail = true;
    await vi.advanceTimersByTimeAsync(9 * 30_000);
    expect(handle.ref.release).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(handle.ref.release).toHaveBeenCalled();
    await vi.runOnlyPendingTimersAsync();
    expect(destroyed).toHaveBeenCalled();
  });
});

describe("AirPurifier", () => {
  const props = {
    power: "on",
    mode: "auto",
    temp_dec: 215,
    humidity: 40,
    aqi: 12,
    favorite_level: 5,
    led: "on",
    led_b: 1,
    buzzer: "off",
  };

  test("maps the properties to its capabilities", async () => {
    const { device } = await loaded(AirPurifier, "zhimi.airpurifier.m1", props);
    expect(device.matches("type:air-purifier", "type:miio:air-purifier")).toBe(
      true,
    );
    expect(
      device.matches(
        "cap:switchable-power",
        "cap:switchable-mode",
        "cap:pm2.5",
      ),
    ).toBe(true);
    expect(await device.power()).toBe(true);
    expect(await device.mode()).toBe("auto");
    expect(Number(await device.temperature())).toBe(21.5);
    expect(await device.relativeHumidity()).toBe(40);
    expect(await device.pm2_5()).toBe(12);
    expect(device.led()).toBe(true);
    expect(device.buzzer()).toBe(false);
  });

  test("sends the commands", async () => {
    const { device, call } = await loaded(
      AirPurifier,
      "zhimi.airpurifier.m1",
      props,
      {
        set_power: ["ok"],
        set_mode: ["ok"],
        set_buzzer: ["ok"],
      },
    );
    vi.useFakeTimers();
    try {
      const done = Promise.all([
        device.setPower(false),
        device.setMode("silent"),
        device.setBuzzer(true),
      ]);
      await vi.advanceTimersByTimeAsync(1000);
      await done;
    } finally {
      vi.useRealTimers();
    }
    const sent = sentCalls(call).filter(([m]) => m !== "get_prop");
    expect(sent).toEqual([
      ["set_power", ["off"]],
      ["set_mode", ["silent"]],
      ["set_buzzer", ["on"]],
    ]);
  });
});

describe("AirMonitor", () => {
  test("reports the AQI, battery and charging", async () => {
    const { device } = await loaded(AirMonitor, "zhimi.airmonitor.v1", {
      power: "on",
      aqi: 30,
      battery: 80,
      usb_state: "on",
    });
    expect(device.matches("type:air-monitor", "cap:battery-level")).toBe(true);
    expect(await device.pm2_5()).toBe(30);
    expect(await device.batteryLevel()).toBe(80);
    expect(await device.charging).toBe(true);
  });
});

describe("Humidifier", () => {
  test("emulates the idle mode when it's off", async () => {
    const { device } = await loaded(Humidifier, "zhimi.humidifier.v1", {
      power: "off",
      mode: "high",
      limit_hum: 50,
      temp_dec: 200,
      humidity: 45,
      led_b: 2,
      buzzer: "on",
    });
    expect(
      device.matches("type:humidifier", "cap:adjustable-target-humidity"),
    ).toBe(true);
    expect(await device.mode()).toBe("idle");
    expect(await device.targetHumidity()).toBe(50);
    expect(await device.ledBrightness()).toBe("off");

    device.setProperty("power", true);
    expect(await device.mode()).toBe("high");
  });

  test("rejects unknown LED brightness", async () => {
    const { device } = await loaded(Humidifier, "zhimi.humidifier.v1", {});
    await expect(device.ledBrightness("blinding")).rejects.toThrow(
      "Invalid LED brigthness",
    );
  });
});

describe("plugs", () => {
  test("PowerPlug follows and switches the power", async () => {
    const { device, call } = await loaded(
      PowerPlug,
      "chuangmi.plug.m1",
      { power: "off" },
      {
        set_power: ["ok"],
      },
    );
    expect(device.matches("type:power-plug", "type:power-outlet")).toBe(true);
    expect(await device.power()).toBe(false);
    vi.useFakeTimers();
    try {
      const done = device.turnOn();
      await vi.advanceTimersByTimeAsync(100);
      await done;
    } finally {
      vi.useRealTimers();
    }
    expect(sentCalls(call)[0]).toEqual(["set_power", ["on"]]);
  });

  test("PowerPlugChuangmiV1 has a USB outlet child", async () => {
    const { device } = await loaded(PowerPlugChuangmiV1, "chuangmi.plug.v1", {
      on: true,
    });
    expect(await device.power()).toBe(true);
    const usb = device.child("usb");
    expect(usb?.id).toBe("miio:1234:usb");
    expect(usb?.matches("type:power-outlet", "cap:switchable-power")).toBe(
      true,
    );
    device.setProperty("powerChannelUsb", true);
    expect(usb?.getState("power")).toBe(true);
  });

  test("PowerStrip follows the power and the mode", async () => {
    const { device } = await loaded(PowerStrip, "qmi.powerstrip.v1", {
      power: "on",
      mode: "green",
    });
    expect(device.matches("type:power-strip")).toBe(true);
    expect(await device.power()).toBe(true);
    expect(await device.mode()).toBe("green");
  });
});

describe("lights", () => {
  test("PhilipsLightBulb maps the colour temperature", async () => {
    const { device, call } = await loaded(
      PhilipsLightBulb,
      "philips.light.bulb",
      { power: "on", bright: "80", cct: "50" },
      { set_cct: ["ok"] },
    );
    expect(device.matches("type:light-bulb", "cap:color:temperature")).toBe(
      true,
    );
    expect(await device.brightness()).toBe(80);
    expect((await device.color())?.temperature.kelvins).toBe(4350);

    vi.useFakeTimers();
    try {
      const done = device.setColor("5700K");
      await vi.advanceTimersByTimeAsync(100);
      await done;
    } finally {
      vi.useRealTimers();
    }
    expect(sentCalls(call)[0]).toEqual(["set_cct", [100]]);
  });

  test("YeelightMono maps the colour temperature, clamped to its range", async () => {
    const { device, call } = await loaded(
      YeelightMono,
      "yeelink.light.mono1",
      { power: "on", bright: "50", ct: "4000", color_mode: "2", name: "Desk" },
      { set_ct_abx: ["ok"] },
    );
    expect(device.metadata.name).toBe("Desk");
    expect(device.matches("type:light", "cap:fading", "cap:nameable")).toBe(
      true,
    );
    expect((await device.color())?.kelvins).toBe(4000);
    expect((await device.maxChangeTime())?.ms).toBe(30_000);
    expect(await device.colorTemperatureRange()).toEqual({
      min: 2700,
      max: 6500,
    });

    vi.useFakeTimers();
    try {
      const done = device.setColor("9000K", 0);
      await vi.advanceTimersByTimeAsync(100);
      await done;
    } finally {
      vi.useRealTimers();
    }
    expect(sentCalls(call)[0]).toEqual(["set_ct_abx", [6500, "sudden", 0]]);
  });

  test("YeelightColor builds the colour from the colour mode", async () => {
    const { device, call } = await loaded(
      YeelightColor,
      "yeelink.light.color1",
      { power: "on", bright: "100", color_mode: "1", rgb: String(0xff0000) },
      { set_rgb: ["ok"], set_hsv: ["ok"] },
    );
    expect(device.matches("cap:color:full")).toBe(true);
    expect(await device.color()).toEqual(new Color([255, 0, 0], "rgb"));

    vi.useFakeTimers();
    try {
      const done = Promise.all([
        device.setColor("#00ff00"),
        device.setColor("hsl(240, 100%, 50%)"),
      ]);
      await vi.advanceTimersByTimeAsync(100);
      await done;
    } finally {
      vi.useRealTimers();
    }
    expect(sentCalls(call).filter(([m]) => m !== "get_prop")).toEqual([
      ["set_rgb", [0x00ff00, "smooth", 400]],
      ["set_hsv", [240, 100, "smooth", 400]],
    ]);
  });

  test("EyecareLamp2 has an ambient light child", async () => {
    const { device, call } = await loaded(
      EyecareLamp2,
      "philips.light.sread1",
      { power: "on", bright: "60", ambstatus: "on", ambvalue: "30" },
      { enable_amb: ["ok"] },
    );
    expect(await device.brightness()).toBe(60);
    const ambient = device.ambient;
    expect(ambient.id).toBe("miio:1234:ambient");
    expect(await ambient.power()).toBe(true);
    expect(await ambient.brightness()).toBe(30);

    vi.useFakeTimers();
    try {
      const done = ambient.turnOff();
      await vi.advanceTimersByTimeAsync(100);
      await done;
    } finally {
      vi.useRealTimers();
    }
    expect(sentCalls(call)[0]).toEqual(["enable_amb", ["off"]]);
  });
});

/**
 * Runs an action that waits on timers (`refreshDelay`, effects…).
 *
 * @param action The action to run
 * @returns Its result
 */
async function withTimers<T>(action: () => Promise<T>) {
  vi.useFakeTimers();
  try {
    const done = action();
    const settled = done.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(1000);
    const result = await settled;
    if ("error" in result) throw result.error;
    return result.value;
  } finally {
    vi.useRealTimers();
  }
}

/**
 * The calls other than the polling.
 *
 * @param call The mocked call
 * @returns The `[method, params]` calls
 */
const commands = (call: Parameters<typeof sentCalls>[0]) =>
  sentCalls(call).filter(([m]) => m !== "get_prop");

describe("AirPurifier commands", () => {
  const props = { power: "on", mode: "auto", favorite_level: 5, led_b: 0 };

  test("reads and sets the favorite level", async () => {
    const { device, call } = await loaded(
      AirPurifier,
      "zhimi.airpurifier.m1",
      props,
      { set_level_favorite: ["ok"] },
    );
    await expect(device.favoriteLevel()).resolves.toBe(5);
    expect(call).not.toHaveBeenCalled();
    await expect(device.favoriteLevel(9)).resolves.toBeNull();
    expect(commands(call)).toEqual([["set_level_favorite", [9]]]);
  });

  test.each([
    ["bright", 0],
    ["dim", 1],
    ["off", 2],
  ])("sets the LED brightness to %s", async (level, value) => {
    const { device, call } = await loaded(
      AirPurifier,
      "zhimi.airpurifier.m1",
      props,
      { set_led_b: ["ok"] },
    );
    await device.ledBrightness(level);
    expect(commands(call)[0]).toEqual(["set_led_b", [value]]);
  });

  test("maps unknown LED brightness values", async () => {
    const { device } = await loaded(AirPurifier, "zhimi.airpurifier.m1", {
      ...props,
      led_b: 7,
    });
    expect(await device.ledBrightness()).toBe("unknown");
  });

  test("rejects an invalid LED brightness without calling the device", async () => {
    const { device, call } = await loaded(
      AirPurifier,
      "zhimi.airpurifier.m1",
      props,
    );
    await expect(device.ledBrightness("blinding")).rejects.toThrow(
      "Invalid LED brigthness: blinding",
    );
    expect(call).not.toHaveBeenCalled();
  });

  test("explains when a mode is not supported", async () => {
    const { device } = await loaded(
      AirPurifier,
      "zhimi.airpurifier.m1",
      props,
      {
        set_mode: () => {
          throw Object.assign(new Error("unsupported"), { code: -5001 });
        },
      },
    );
    await expect(withTimers(() => device.setMode("silent"))).rejects.toThrow(
      "Mode `silent` not supported",
    );
  });

  test("passes through other mode errors", async () => {
    const { device } = await loaded(
      AirPurifier,
      "zhimi.airpurifier.m1",
      props,
      {
        set_mode: () => {
          throw new Error("timeout");
        },
      },
    );
    await expect(withTimers(() => device.setMode("silent"))).rejects.toThrow(
      "timeout",
    );
  });
});

describe("Humidifier commands", () => {
  const props = { power: "off", mode: "auto", limit_hum: 50, led_b: 1 };

  test("changing the mode powers the device on first", async () => {
    const { device, call } = await loaded(
      Humidifier,
      "zhimi.humidifier.v1",
      props,
      { set_power: ["ok"], set_mode: ["ok"] },
    );
    await withTimers(() => device.setMode("high"));
    expect(commands(call).map(([m]) => m)).toEqual(["set_power", "set_mode"]);
    expect(commands(call)[0]).toEqual(["set_power", ["on"]]);
    expect(commands(call)[1]).toEqual(["set_mode", ["high"]]);
  });

  test("the idle mode powers the device off", async () => {
    const { device, call } = await loaded(
      Humidifier,
      "zhimi.humidifier.v1",
      { ...props, power: "on" },
      { set_power: ["ok"] },
    );
    await withTimers(() => device.setMode("idle"));
    expect(commands(call)).toEqual([["set_power", ["off"]]]);
  });

  test("explains when a mode is not supported, and passes through other errors", async () => {
    let error: Error = Object.assign(new Error("x"), { code: -5001 });
    const { device } = await loaded(
      Humidifier,
      "zhimi.humidifier.v1",
      { ...props, power: "on" },
      {
        set_mode: () => {
          throw error;
        },
      },
    );
    await expect(withTimers(() => device.setMode("turbo"))).rejects.toThrow(
      "Mode `turbo` not supported",
    );
    error = new Error("timeout");
    await expect(withTimers(() => device.setMode("turbo"))).rejects.toThrow(
      "timeout",
    );
  });

  test("sets the target humidity and the LED brightness", async () => {
    const { device, call } = await loaded(
      Humidifier,
      "zhimi.humidifier.v1",
      props,
      { set_limit_hum: ["ok"], set_led_b: ["ok"] },
    );
    await withTimers(() => device.setTargetHumidity(60));
    await withTimers(() => device.ledBrightness("dim"));
    expect(commands(call)).toEqual([
      ["set_limit_hum", [60]],
      ["set_led_b", [1]],
    ]);
  });
});

describe("Yeelight commands", () => {
  const props = { power: "off", bright: "40", color_mode: "3", name: "Lamp" };
  const responses = {
    set_power: ["ok"],
    set_bright: ["ok"],
    set_name: ["ok"],
    set_default: ["ok"],
  };

  test("powers on and off with the default effect", async () => {
    const { device, call } = await loaded(
      YeelightMono,
      "yeelink.light.mono1",
      props,
      responses,
    );
    await withTimers(() => device.setPower(true));
    await withTimers(() => device.setPower(false));
    expect(commands(call)).toEqual([
      ["set_power", ["on", "smooth", 500]],
      ["set_power", ["off", "smooth", 500]],
    ]);
  });

  test("brightness 0 powers off, and a positive one powers on first", async () => {
    const { device, call } = await loaded(
      YeelightMono,
      "yeelink.light.mono1",
      props,
      responses,
    );
    await withTimers(() => device.setBrightness(0));
    await withTimers(() => device.setBrightness(70));
    expect(commands(call)).toEqual([
      ["set_power", ["off", "smooth", 500]],
      ["set_power", ["on", "smooth", 500]],
      ["set_bright", [70, "smooth", 400]],
    ]);
  });

  test("brightness does not power on when it's already on, or when asked not to", async () => {
    const { device, call } = await loaded(
      YeelightMono,
      "yeelink.light.mono1",
      { ...props, power: "on" },
      responses,
    );
    await withTimers(() => device.setBrightness(70));
    expect(commands(call)).toEqual([["set_bright", [70, "smooth", 400]]]);
    device.setProperty("power", false);
    call.mockClear();
    await withTimers(() => device.setBrightness(80, undefined, false));
    expect(commands(call)).toEqual([["set_bright", [80, "smooth", 400]]]);
  });

  test("renames the light and saves the default state", async () => {
    const { device, call } = await loaded(
      YeelightMono,
      "yeelink.light.mono1",
      props,
      responses,
    );
    expect(device.metadata.name).toBe("Lamp");
    await device.setName("Desk");
    await device.setDefault();
    expect(commands(call)).toEqual([
      ["set_name", ["Desk"]],
      ["set_default", []],
    ]);
    expect(device.metadata.name).toBe("Desk");
  });

  test("effects honour the requested duration", async () => {
    const { device, call } = await loaded(
      YeelightMono,
      "yeelink.light.mono1",
      { ...props, power: "on" },
      responses,
    );
    await withTimers(() => device.setBrightness(30, "2s"));
    await withTimers(() => device.setBrightness(30, 0));
    expect(commands(call)).toEqual([
      ["set_bright", [30, "smooth", 2000]],
      ["set_bright", [30, "sudden", 0]],
    ]);
  });
});

describe("EyecareLamp2 commands", () => {
  const props = { power: "on", bright: "60", ambstatus: "on", ambvalue: "30" };

  test("changes the brightness and the ambient light", async () => {
    const { device, call } = await loaded(
      EyecareLamp2,
      "philips.light.sread1",
      props,
      { set_bright: ["ok"], enable_amb: ["ok"], set_amb_bright: ["ok"] },
    );
    await withTimers(() => device.setBrightness(80));
    await withTimers(() => device.ambient.setBrightness(10));
    await withTimers(() => device.ambient.turnOn());
    expect(commands(call).map(([m]) => m)).toEqual(
      expect.arrayContaining(["set_bright", "set_amb_bright", "enable_amb"]),
    );
    expect(commands(call).find(([m]) => m === "set_bright")?.[1]).toEqual([80]);
    expect(commands(call).find(([m]) => m === "set_amb_bright")?.[1]).toEqual([
      10,
    ]);
    expect(commands(call).find(([m]) => m === "enable_amb")?.[1]).toEqual([
      "on",
    ]);
  });

  test("toggles the eye care mode", async () => {
    const { device, call } = await loaded(
      EyecareLamp2,
      "philips.light.sread1",
      { ...props, eyecare: "on" },
      { set_eyecare: ["ok"] },
    );
    await expect(device.eyeCare()).resolves.toBe(true);
    await withTimers(() => device.setEyeCare(false));
    expect(commands(call)[0]).toEqual(["set_eyecare", ["off"]]);
  });
});
