import { EventEmitter } from "node:events";

import { describe, test, expect, vi } from "vitest";

import { createFakeHandle, sentCalls } from "../../test_utils.test.mock";
import { GatewayBasic, GatewayWithLightAndSensor } from "../gateway";

import { Cube, Switch, Switch2 } from "./controllers";
import { CtrlNeutral2 } from "./ctrl_neutral2";
import { GatewayLight } from "./gateway-light";
import { Plug } from "./plug";
import { Magnet, MotionSensor, WeatherSensor } from "./sensors";
import type { SubDeviceParent } from "./subdevice";

vi.mock("debug", () => ({ default: vi.fn(() => vi.fn()) }));

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** A fake gateway: a developer API that reports properties, and a mocked call */
function fakeParent() {
  const devApi = Object.assign(new EventEmitter(), { read: vi.fn() });
  const call = vi.fn().mockResolvedValue(["ok"]);
  const parent = { id: "miio:1", devApi, call } as unknown as SubDeviceParent;
  /**
   * Reports the properties of a sub-device, as the developer API does.
   *
   * @param id The internal id of the sub-device
   * @param data The properties
   */
  const report = (id: string, data: Record<string, unknown>) =>
    devApi.emit(`properties:${id}`, data);
  return { parent, devApi, call, report };
}

/**
 * Records the events emitted by a thing.
 *
 * @param thing The thing
 * @param events The events
 * @returns The recorded `[event, data]`
 */
function record(thing: EventEmitter, ...events: string[]) {
  const calls: [string, unknown][] = [];
  for (const event of events) {
    thing.on(event, (data: unknown) => calls.push([event, data]));
  }
  return calls;
}

describe("gateway sub-devices", () => {
  test("initialize with the properties reported by the developer API", async () => {
    const { parent, devApi, report } = fakeParent();
    const sensor = new WeatherSensor(parent, {
      id: "miio:158d0001",
      model: "lumi.weather",
    });
    devApi.read.mockImplementation((id: string) =>
      report(id, {
        temperature: 2150,
        humidity: 4500,
        pressure: 101325,
        voltage: 3050,
      }),
    );

    await sensor.init();
    expect(devApi.read).toHaveBeenCalledWith("158d0001");
    expect(
      sensor.matches("type:miio:subdevice", "type:sensor", "cap:temperature"),
    ).toBe(true);
    expect(Number(await sensor.temperature())).toBe(21.5);
    expect(await sensor.relativeHumidity()).toBe(45);
    expect(Number(await sensor.atmosphericPressure())).toBe(101325);
    expect(await sensor.batteryLevel()).toBe(50);

    await sensor.destroy();
    expect(devApi.listenerCount("properties:158d0001")).toBe(0);
  });

  test("fall back to get_device_prop_exp when the developer API doesn't answer", async () => {
    vi.useFakeTimers();
    try {
      const { parent, call } = fakeParent();
      call.mockResolvedValue([["close", 3300]]);
      const magnet = new Magnet(parent, {
        id: "miio:158d0002",
        model: "lumi.magnet",
      });
      const loading = magnet.loadProperties(["contact"]);
      await vi.advanceTimersByTimeAsync(1000);
      await loading;
      expect(sentCalls(call)).toEqual([
        ["get_device_prop_exp", [["lumi.158d0002", "status", "voltage"]]],
      ]);
      expect(await magnet.isClosed()).toBe(true);
      expect(await magnet.batteryLevel()).toBe(100);
    } finally {
      vi.useRealTimers();
    }
  });

  test("controllers emit their actions", async () => {
    const { parent, report } = fakeParent();
    const cube = new Cube(parent, { id: "miio:cube", model: "lumi.cube" });
    const button = new Switch(parent, {
      id: "miio:button",
      model: "lumi.switch",
    });
    const wall = new Switch2(parent, { id: "miio:wall", model: "lumi.86sw2" });
    for (const d of [cube, button, wall]) {
      parent.devApi?.on(`properties:${d.internalId}`, d._report);
    }
    const cubeActions = record(cube, "action");
    const buttonActions = record(button, "action:double_click");
    const wallActions = record(wall, "action");

    report("cube", { rotate: "90,500" });
    report("button", { status: "double_click" });
    report("wall", { channel_1: "click" });
    await flush();

    expect(cubeActions).toEqual([
      ["action", { action: "rotate", data: { amount: 90 } }],
    ]);
    expect(buttonActions).toEqual([["action:double_click", {}]]);
    expect(wallActions).toEqual([
      ["action", { action: "btn1-click", data: {} }],
    ]);
    expect(
      button.matches("type:button", "cap:actions", "cap:battery-level"),
    ).toBe(true);
    expect(wall.type).toBe("controller");
  });

  test("motion goes back to idle after a minute", async () => {
    vi.useFakeTimers();
    try {
      const { parent } = fakeParent();
      const motion = new MotionSensor(parent, {
        id: "miio:motion",
        model: "lumi.motion",
      });
      motion._report({ status: "motion" });
      expect(await motion.motion()).toBe(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await motion.motion()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("the plug reports its power and sends toggle_plug with its sid", async () => {
    const { parent, call } = fakeParent();
    const plug = new Plug(parent, { id: "miio:plug", model: "lumi.plug" });
    plug._report({ status: "on", load_power: "12", power_consumed: "1.5" });
    expect(await plug.power()).toBe(true);
    expect(Number(await plug.powerLoad())).toBe(12);
    expect(Number(await plug.powerConsumed())).toBe(1.5);

    await plug.turnOff();
    expect(call).toHaveBeenCalledWith("toggle_plug", ["neutral_0", "off"], {
      sid: "plug",
    });
  });

  test("light switches have a child per channel", async () => {
    const { parent, call } = fakeParent();
    const ctrl = new CtrlNeutral2(parent, {
      id: "miio:ctrl",
      model: "lumi.ctrl_neutral2",
    });
    expect(ctrl.miioModel).toBe("lumi.ctrl_neutral2");
    expect(ctrl.matches("type:wall-switch", "type:miio:power-switch")).toBe(
      true,
    );
    const channels = [...ctrl.children()];
    expect(channels.map((c) => c.id)).toEqual(["miio:ctrl:0", "miio:ctrl:1"]);

    ctrl._report({ channel_1: "on" });
    expect(
      await ctrl
        .child<(typeof channels)[number] & { power(): Promise<boolean> }>("1")
        ?.power(),
    ).toBe(true);

    await (
      ctrl.child("0") as unknown as { turnOn(): Promise<boolean> }
    ).turnOn();
    expect(call).toHaveBeenCalledWith(
      "toggle_ctrl_neutral",
      ["neutral_0", "on"],
      { sid: "ctrl" },
    );
  });
});

describe("Gateway", () => {
  test("syncs its children with the device list", async () => {
    const { handle, call } = createFakeHandle("lumi.gateway.v3", {
      get_device_prop: ["lumi.158d01", 9, 1, 0, 0, "lumi.158d02", 10, 0, 0, 0],
    });
    const gateway = new GatewayBasic(handle);
    const devApi = Object.assign(new EventEmitter(), {
      read: vi.fn(),
      destroy: vi.fn(),
    });
    gateway.devApi = devApi as unknown as GatewayBasic["devApi"];
    devApi.read.mockImplementation((id: string) =>
      devApi.emit(`properties:${id}`, { channel_0: "off" }),
    );

    await gateway._updateDeviceList();
    expect(sentCalls(call)).toEqual([
      ["get_device_prop", ["lumi.0", "device_list"]],
    ]);
    // Only the online one
    expect([...gateway.children()].map((c) => c.id)).toEqual(["miio:158d01"]);
    expect(gateway.child("miio:158d01")?.matches("type:wall-switch")).toBe(
      true,
    );
  });

  test("the light follows the rgb property of the gateway", async () => {
    const { handle, call } = createFakeHandle("lumi.gateway.v3", {
      get_prop: (props: unknown) =>
        (props as string[]).map((p) => (p === "rgb" ? 0x64ff0000 : 100)),
      set_rgb: ["ok"],
    });
    const gateway = new GatewayWithLightAndSensor(handle);
    const light = new GatewayLight(gateway);
    expect(gateway.matches("cap:illuminance", "cap:children")).toBe(true);

    await gateway.poll();
    expect(await light.color()).toEqual(
      expect.objectContaining({ values: [255, 0, 0] }),
    );
    expect(await light.brightness()).toBe(100);
    expect(await light.power()).toBe(true);
    expect(Number(await gateway.illuminance())).toBe(100);

    call.mockClear();
    vi.useFakeTimers();
    try {
      const done = light.setBrightness(50);
      await vi.advanceTimersByTimeAsync(100);
      await done;
    } finally {
      vi.useRealTimers();
    }
    expect(sentCalls(call)[0]).toEqual([
      "set_rgb",
      [((50 << 24) | (255 << 16)) >>> 0],
    ]);
  });
});
