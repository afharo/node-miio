import { createFakeHandle, sentCalls } from "../test_utils.test.mock";
import { Device } from "../device";
import { Color } from "../things/color";

import { AirMonitor } from "./air-monitor";
import { AirPurifier } from "./air-purifier";
import { PowerPlugChuangmiV1 } from "./chuangmi.plug.v1";
import { EyecareLamp2 } from "./eyecare-lamp2";
import { Humidifier } from "./humidifier";
import { PhilipsLightBulb } from "./philips-light-bulb";
import { PowerPlug } from "./power-plug";
import { PowerStrip } from "./power-strip";
import { YeelightColor } from "./yeelight.color";
import { YeelightMono } from "./yeelight.mono";

jest.mock("debug", () => jest.fn().mockReturnValue(jest.fn()));

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
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("init polls once, then every 30 seconds", async () => {
    const { handle, call } = createFakeHandle("chuangmi.plug.m1", {
      get_prop: getProp({ power: "on" }),
    });
    const plug = new PowerPlug(handle);
    await plug.init();
    expect(call).toHaveBeenCalledTimes(1);
    expect(await plug.power()).toBe(true);

    await jest.advanceTimersByTimeAsync(30_000);
    expect(call).toHaveBeenCalledTimes(2);
    await plug.destroy();
    await jest.advanceTimersByTimeAsync(60_000);
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
    const destroyed = jest.fn();
    plug.on("thing:destroyed", destroyed);
    await plug.init();

    fail = true;
    await jest.advanceTimersByTimeAsync(9 * 30_000);
    expect(handle.ref.release).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(handle.ref.release).toHaveBeenCalled();
    await jest.runOnlyPendingTimersAsync();
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
    jest.useFakeTimers();
    try {
      const done = Promise.all([
        device.setPower(false),
        device.setMode("silent"),
        device.setBuzzer(true),
      ]);
      await jest.advanceTimersByTimeAsync(1000);
      await done;
    } finally {
      jest.useRealTimers();
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
    jest.useFakeTimers();
    try {
      const done = device.turnOn();
      await jest.advanceTimersByTimeAsync(100);
      await done;
    } finally {
      jest.useRealTimers();
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

    jest.useFakeTimers();
    try {
      const done = device.setColor("5700K");
      await jest.advanceTimersByTimeAsync(100);
      await done;
    } finally {
      jest.useRealTimers();
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

    jest.useFakeTimers();
    try {
      const done = device.setColor("9000K", 0);
      await jest.advanceTimersByTimeAsync(100);
      await done;
    } finally {
      jest.useRealTimers();
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

    jest.useFakeTimers();
    try {
      const done = Promise.all([
        device.setColor("#00ff00"),
        device.setColor("hsl(240, 100%, 50%)"),
      ]);
      await jest.advanceTimersByTimeAsync(100);
      await done;
    } finally {
      jest.useRealTimers();
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

    jest.useFakeTimers();
    try {
      const done = ambient.turnOff();
      await jest.advanceTimersByTimeAsync(100);
      await done;
    } finally {
      jest.useRealTimers();
    }
    expect(sentCalls(call)[0]).toEqual(["enable_amb", ["off"]]);
  });
});
