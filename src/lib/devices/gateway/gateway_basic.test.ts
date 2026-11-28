import { EventEmitter } from "node:events";

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

import { createFakeHandle, sentCalls } from "../../test_utils.test.mock.js";
import { GatewayBasic, GatewayWithLightAndSensor } from "../gateway.js";
import { color } from "../../things/color.js";
import { MiioThing } from "../../things/thing.js";

import { GatewayLight } from "./gateway-light.js";
import { SubDevice } from "./subdevice.js";
import { subDeviceTypes } from "./subdevices.js";

vi.mock("debug", () => ({ default: vi.fn(() => vi.fn()) }));

const apis: (EventEmitter & { destroy: ReturnType<typeof vi.fn> })[] = [];
vi.mock("./developer-api.js", () => ({
  default: class extends EventEmitter {
    destroy = vi.fn();
    read = vi.fn();
    constructor() {
      super();
      apis.push(this);
    }
  },
}));

/** A 16 characters key, as the gateway stores them */
const KEY = "0123456789abcdef";

describe("GatewayBasic", () => {
  beforeEach(() => {
    apis.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("developer key", () => {
    test("uses the key stored in the gateway and waits for the developer API", async () => {
      const { handle, call } = createFakeHandle("lumi.gateway.v3", {
        get_lumi_dpf_aes_key: [KEY],
      });
      const gateway = new GatewayBasic(handle);
      const found = gateway._findDeveloperKey();
      await vi.advanceTimersByTimeAsync(0);
      apis[0].emit("ready");
      await expect(found).resolves.toBe(KEY);

      expect(sentCalls(call)).toStrictEqual([["get_lumi_dpf_aes_key", []]]);
      expect(gateway._developerKey).toBe(KEY);
      // Already known: nothing else is sent
      await expect(gateway._findDeveloperKey()).resolves.toBe(KEY);
      expect(call).toHaveBeenCalledTimes(1);
    });

    test("generates and stores a key when the gateway has none", async () => {
      const { handle, call } = createFakeHandle("lumi.gateway.v3", {
        get_lumi_dpf_aes_key: [""],
        set_lumi_dpf_aes_key: ["ok"],
      });
      const gateway = new GatewayBasic(handle);
      const found = gateway._findDeveloperKey();
      await vi.advanceTimersByTimeAsync(0);
      apis[0].emit("ready");
      const key = await found;

      expect(key).toMatch(/^[0-9a-z]{16}$/);
      expect(sentCalls(call)).toStrictEqual([
        ["get_lumi_dpf_aes_key", []],
        ["set_lumi_dpf_aes_key", [key]],
      ]);
    });

    test("clears the timeout once the developer API is ready", async () => {
      const { handle } = createFakeHandle("lumi.gateway.v3", {});
      const gateway = new GatewayBasic(handle);
      const result = gateway._setDeveloperKey(KEY);
      expect(vi.getTimerCount()).toBe(1);
      apis[0].emit("ready");
      await result;
      expect(vi.getTimerCount()).toBe(0);
    });

    test("does not create a second developer API", async () => {
      const { handle } = createFakeHandle("lumi.gateway.v3", {});
      const gateway = new GatewayBasic(handle);
      const first = gateway._setDeveloperKey(KEY);
      apis[0].emit("ready");
      await first;
      await gateway._setDeveloperKey("another-key-1234");
      expect(apis).toHaveLength(1);
      expect(gateway._developerKey).toBe("another-key-1234");
    });

    test("rejects when the developer API is not ready in 10 seconds", async () => {
      const { handle } = createFakeHandle("lumi.gateway.v3", {});
      const gateway = new GatewayBasic(handle);
      const result = gateway._setDeveloperKey(KEY);
      const outcome = result.then(
        () => "resolved",
        (reason: unknown) => reason,
      );
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await outcome).toBeUndefined();
    });

    test("reports the properties of the gateway itself, ignoring sub-devices", () => {
      const { handle } = createFakeHandle("lumi.gateway.v3", {});
      const gateway = new GatewayBasic(handle);
      void gateway._setDeveloperKey(KEY);
      const report = vi.spyOn(gateway, "_report");

      apis[0].emit("propertiesChanged", { id: "158d01", data: { a: 1 } });
      expect(report).not.toHaveBeenCalled();
      apis[0].emit("propertiesChanged", { id: "0", data: { illumination: 7 } });
      expect(report).toHaveBeenCalledWith({ illumination: 7 });
    });
  });

  test("rgb is split into colour and brightness", async () => {
    const { handle } = createFakeHandle("lumi.gateway.v3", {
      get_prop: (props: unknown) => (props as string[]).map(() => 0x80102030),
    });
    const gateway = new GatewayBasic(handle);
    await gateway.poll();
    expect(gateway.property("rgb")).toStrictEqual({
      red: 0x10,
      green: 0x20,
      blue: 0x30,
    });
    expect(gateway.property("brightness")).toBe(0x80);
  });

  describe("device list", () => {
    const list = [
      "lumi.0",
      "lumi.gateway",
      1,
      0,
      0,
      "lumi.158d01",
      "switch",
      1,
      0,
      0,
    ];

    test("skips the gateway itself and creates sub-devices of the registered types", async () => {
      class Custom extends SubDevice {}
      GatewayBasic.registerSubDevice("custom-type", Custom);
      try {
        const { handle } = createFakeHandle("lumi.gateway.v3", {
          get_device_prop: [...list, "lumi.158d02", "custom-type", 1, 0, 0],
        });
        const gateway = new GatewayBasic(handle);
        gateway.syncer.update = vi.fn().mockResolvedValue(undefined);
        await gateway._updateDeviceList();
        expect(gateway.syncer.update).toHaveBeenCalledWith([
          { id: "miio:158d01", type: "switch", online: true },
          { id: "miio:158d02", type: "custom-type", online: true },
        ]);
      } finally {
        delete subDeviceTypes["custom-type"];
      }
    });

    test("the syncer builds a generic sub-device for unknown types and keeps the existing ones", async () => {
      const { handle } = createFakeHandle("lumi.gateway.v3", {});
      const gateway = new GatewayBasic(handle);
      const added = vi.fn();
      gateway.on("thing:added", added);
      // No developer API: the sub-device has nothing to read from
      const devApi = Object.assign(new EventEmitter(), {
        read: vi.fn(),
        destroy: vi.fn(),
      });
      devApi.read.mockImplementation((id: string) =>
        devApi.emit(`properties:${id}`, {}),
      );
      gateway.devApi = devApi as unknown as GatewayBasic["devApi"];

      await gateway.syncer.update([
        { id: "miio:158d09", type: "unheard-of", online: true },
        { id: "miio:158d0a", type: "unheard-of", online: false },
      ]);
      const children = [...gateway.children()];
      expect(children.map((c) => c.id)).toStrictEqual(["miio:158d09"]);
      expect(children[0]).toBeInstanceOf(SubDevice);

      await gateway.syncer.update([
        { id: "miio:158d09", type: "unheard-of", online: true },
      ]);
      expect([...gateway.children()][0]).toBe(children[0]);
    });

    test("extra children are part of the list, and need an id", async () => {
      const { handle } = createFakeHandle("lumi.gateway.v3", {
        get_device_prop: [],
      });
      const gateway = new GatewayBasic(handle);
      expect(() => gateway.addExtraChild(new MiioThing())).toThrow(
        "Child needs to have an `id`",
      );
      const light = new GatewayLight(gateway);
      gateway.addExtraChild(light);
      gateway.syncer.update = vi.fn().mockResolvedValue(undefined);
      await gateway._updateDeviceList();
      expect(gateway.syncer.update).toHaveBeenCalledWith([light]);
    });
  });

  describe("pairing", () => {
    test("addDevice opens the network for 30 seconds, then refreshes the list", async () => {
      const { handle, call } = createFakeHandle("lumi.gateway.v3", {
        start_zigbee_join: ["ok"],
        get_device_prop: [],
      });
      const gateway = new GatewayBasic(handle);
      await gateway.addDevice();
      expect(sentCalls(call)).toStrictEqual([["start_zigbee_join", [30]]]);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(sentCalls(call)[1][0]).toBe("get_device_prop");
    });

    test("stopAddDevice closes the network", async () => {
      const { handle, call } = createFakeHandle("lumi.gateway.v3", {
        start_zigbee_join: ["ok"],
      });
      await new GatewayBasic(handle).stopAddDevice();
      expect(sentCalls(call)).toStrictEqual([["start_zigbee_join", [0]]]);
    });

    test("removeDevice removes it and refreshes the list", async () => {
      const { handle, call } = createFakeHandle("lumi.gateway.v3", {
        remove_device: ["ok"],
        get_device_prop: [],
      });
      await new GatewayBasic(handle).removeDevice("lumi.158d01");
      expect(sentCalls(call)).toStrictEqual([
        ["remove_device", ["lumi.158d01"]],
        ["get_device_prop", ["lumi.0", "device_list"]],
      ]);
    });

    test("rejects when the gateway doesn't answer ok", async () => {
      const { handle } = createFakeHandle("lumi.gateway.v3", {
        start_zigbee_join: "error",
      });
      await expect(new GatewayBasic(handle).addDevice()).rejects.toThrow();
    });
  });

  test("refreshes the list every half an hour until destroyed", async () => {
    const { handle, call } = createFakeHandle("lumi.gateway.v3", {
      get_prop: (props: unknown) => (props as string[]).map(() => 1),
      get_lumi_dpf_aes_key: [KEY],
      get_device_prop: [],
    });
    const gateway = new GatewayWithLightAndSensor(handle);
    const init = gateway.init();
    await vi.advanceTimersByTimeAsync(0);
    apis[0].emit("ready");
    await init;
    const lists = () =>
      sentCalls(call).filter(([m]) => m === "get_device_prop").length;
    // The light is added before the first synchronization
    expect([...gateway.children()].map((c) => c.id)).toContain(
      `${gateway.id}:light`,
    );
    expect(lists()).toBe(1);

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(lists()).toBe(2);

    await gateway.destroy();
    expect(apis[0].destroy).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(lists()).toBe(2);
  });
});

describe("GatewayLight", () => {
  async function setup() {
    const { handle, call } = createFakeHandle("lumi.gateway.v3", {
      get_prop: (props: unknown) =>
        (props as string[]).map((p) => (p === "rgb" ? 0x32102030 : 0)),
      set_rgb: ["ok"],
    });
    const gateway = new GatewayBasic(handle);
    const light = new GatewayLight(gateway);
    await gateway.poll();
    call.mockClear();
    return { gateway, light, call };
  }

  test("is a child named after the gateway", async () => {
    const { gateway, light } = await setup();
    expect(light.id).toBe(`${gateway.id}:light`);
    expect(light.model).toBe("lumi.gateway.v3.light");
    expect(
      light.matches("type:miio:subdevice", "type:miio:gateway-light"),
    ).toBe(true);
  });

  test("power on and off set the brightness, keeping the colour", async () => {
    const { light, call } = await setup();
    await light.changePower(true);
    await light.changePower(false);
    expect(
      sentCalls(call)
        .filter(([m]) => m === "set_rgb")
        .map(([m, p]) => [m, (p as number[])[0]]),
    ).toStrictEqual([
      ["set_rgb", ((50 << 24) | 0x102030) >>> 0],
      ["set_rgb", 0x102030],
    ]);
  });

  test("changing the colour keeps the brightness", async () => {
    const { light, call } = await setup();
    await light.changeColor(color.rgb(1, 2, 3));
    expect(sentCalls(call).filter(([m]) => m === "set_rgb")).toStrictEqual([
      ["set_rgb", [((0x32 << 24) | (1 << 16) | (2 << 8) | 3) >>> 0]],
    ]);
  });

  test("ignores properties it doesn't use", async () => {
    const { gateway, light } = await setup();
    const before = await light.power();
    gateway.propertyUpdated("illuminance", 5, undefined);
    expect(await light.power()).toBe(before);
  });
});
