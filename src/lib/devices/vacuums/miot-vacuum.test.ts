import d110ch from "../../__fixtures__/miot/xiaomi.vacuum.d110ch.json";
import ijaiV3 from "../../__fixtures__/miot/ijai.vacuum.v3.json";
import mijiaV2 from "../../__fixtures__/miot/mijia.vacuum.v2.json";
import p2008 from "../../__fixtures__/miot/dreame.vacuum.p2008.json";
import roborockS5 from "../../__fixtures__/miot/roborock.vacuum.s5.json";
import viomiV10 from "../../__fixtures__/miot/viomi.vacuum.v10.json";
import viomiV18 from "../../__fixtures__/miot/viomi.vacuum.v18.json";
import type { MiotSpec } from "../../miot/miot_spec";
import { createFakeHandle, sentCalls } from "../../test_utils.test.mock";

import {
  isPlaceholderSpec,
  isSupportedMiotVacuum,
  MiotVacuum,
  normalizeState,
} from "./miot-vacuum";

jest.mock("debug", () => jest.fn().mockReturnValue(jest.fn()));

type PropertyRequest = { did: string; siid: number; piid: number };

/**
 * Simulates a device that answers `get_properties` from a map of `"siid.piid"` → value
 * (properties not in the map answer with `code: -4001`).
 */
/** Finds a service of a (cloned) spec, failing the test if it doesn't exist */
function service(spec: MiotSpec, siid: number) {
  const found = spec.services.find((s) => s.iid === siid);
  if (!found) throw new Error(`Service ${siid} not found`);
  return found;
}

function createMiotVacuum(
  model: string,
  spec: unknown,
  values: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) {
  const { handle, call } = createFakeHandle(model, {
    get_properties: (props: PropertyRequest[]) =>
      props.map((p) => {
        const key = `${p.siid}.${p.piid}`;
        return key in values
          ? { ...p, code: 0, value: values[key] }
          : { ...p, code: -4001 };
      }),
    action: (params: { siid: number; aiid: number }) => ({
      ...params,
      code: 0,
    }),
    set_properties: (props: PropertyRequest[]) =>
      props.map((p) => ({ ...p, code: 0 })),
    ...extra,
  });
  return { vacuum: new MiotVacuum(handle, spec as MiotSpec), call };
}

async function withTimers<T>(promise: Promise<T>): Promise<T> {
  const [result] = await Promise.all([
    promise,
    jest.advanceTimersByTimeAsync(5000),
  ]);
  return result;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("normalizeState", () => {
  test.each([
    ["Sweeping", "cleaning"],
    ["Sweeping and Mopping", "cleaning"],
    ["Busy", "cleaning"],
    ["Idle", "idle"],
    ["Paused", "paused"],
    ["Go Charging", "returning"],
    ["Charging", "charging"],
    ["Charging Completed", "fully-charged"],
    ["Sleep", "sleeping"],
    ["Error", "error"],
    ["Upgrading", "updating"],
    ["Remote Control", "remote-control"],
    ["Selected Sweeping", "room-cleaning"],
    ["Area Sweeping", "zone-cleaning"],
    ["Drying", "drying"],
    ["WashingMopPause", "washingmoppause"],
    ["Go Washing", "returning"],
    ["Self Station Clean", "self-station-clean"],
  ])("%p → %p", (description, state) => {
    expect(normalizeState(description)).toBe(state);
  });
});

describe("isSupportedMiotVacuum", () => {
  test.each([
    ["dreame.vacuum.p2008", p2008],
    ["mijia.vacuum.v2", mijiaV2],
    ["ijai.vacuum.v3", ijaiV3],
    ["xiaomi.vacuum.d110ch", d110ch],
    // Legacy roborock models have a (stub) spec that is still technically a vacuum
    ["roborock.vacuum.s5", roborockS5],
  ])("%s is supported", (_model, spec) => {
    expect(isSupportedMiotVacuum(spec as MiotSpec)).toBe(true);
  });

  test("specs without the vacuum service are not supported", () => {
    expect(
      isSupportedMiotVacuum({ type: "x", description: "", services: [] }),
    ).toBe(false);
  });
});

describe("isPlaceholderSpec", () => {
  test.each([
    ["roborock.vacuum.s5", roborockS5],
    ["viomi.vacuum.v10", viomiV10],
  ])("%s has a placeholder spec", (_model, spec) => {
    expect(isPlaceholderSpec(spec as MiotSpec)).toBe(true);
  });

  test.each([
    ["viomi.vacuum.v18", viomiV18],
    ["dreame.vacuum.p2008", p2008],
    ["xiaomi.vacuum.d110ch", d110ch],
  ])("%s has a real spec", (_model, spec) => {
    expect(isPlaceholderSpec(spec as MiotSpec)).toBe(false);
  });
});

describe("MiotVacuum (xiaomi.vacuum.d110ch)", () => {
  const MODEL = "xiaomi.vacuum.d110ch";

  test("is identified as a vacuum", () => {
    const { vacuum } = createMiotVacuum(MODEL, d110ch);
    expect(vacuum.matches("type:vaccuum")).toBe(true);
    expect(vacuum.matches("cap:autonomous-cleaning")).toBe(true);
    expect(vacuum.matches("cap:adjustable-fan-speed")).toBe(true);
  });

  test("reads the standard properties with get_properties", async () => {
    const { vacuum, call } = createMiotVacuum(MODEL, d110ch, {
      "2.1": 6, // status: Charging
      "2.2": 0, // fault: none
      "2.3": 1, // mode: Basic
      "2.8": 2, // mop-water-output-level: Level2
      "3.1": 87, // battery-level
      "3.2": 1, // charging-state: Charging
      "9.2": 90, // main brush
      "10.2": 80, // side brush
      "11.1": 70, // filter-life-level
      "18.1": 60, // mop
    });
    await vacuum.poll();

    const requests = sentCalls(call)
      .filter(([method]) => method === "get_properties")
      .flatMap(([, params]) => params as PropertyRequest[]);
    // Batched in groups of (at most) 10
    const batchSizes = sentCalls(call)
      .filter(([method]) => method === "get_properties")
      .map(([, params]) => (params as unknown[]).length);
    expect(Math.max(...batchSizes)).toBeLessThanOrEqual(10);
    expect(requests).toContainEqual({ did: "status", siid: 2, piid: 1 });

    expect(vacuum.properties).toEqual({
      state: "charging",
      batteryLevel: 87,
      chargingState: "charging",
      fanSpeed: 1,
      waterBoxMode: 2,
      mainBrushLifeLevel: 90,
      sideBrushLifeLevel: 80,
      filterLifeLevel: 70,
      mopLifeLevel: 60,
    });
    await expect(vacuum.charging).resolves.toBe(true);
    await expect(vacuum.batteryLevel()).resolves.toBe(87);
    await expect(vacuum.fanSpeed()).resolves.toBe(1);
  });

  test("ignores values out of the spec's range, keeping the last known one", async () => {
    const values: Record<string, unknown> = { "2.1": 6, "3.1": 87 };
    const { vacuum } = createMiotVacuum(MODEL, d110ch, values);
    await vacuum.poll();
    expect(vacuum.property("batteryLevel")).toBe(87);

    // e.g. xiaomi.vacuum.d101 answers `code: 0` with `-1`
    values["3.1"] = -1;
    values["2.1"] = 1;
    await vacuum.poll();
    expect(vacuum.property("batteryLevel")).toBe(87);
    // The rest is still updated
    expect(vacuum.property("state")).toBe("cleaning");
  });

  test("maps the cleaning state", async () => {
    const { vacuum } = createMiotVacuum(MODEL, d110ch, { "2.1": 1 });
    await vacuum.poll();
    expect(vacuum.property("state")).toBe("cleaning");
    await expect(vacuum.cleaning()).resolves.toBe(true);
  });

  test("maps faults", () => {
    const { vacuum } = createMiotVacuum(MODEL, d110ch);
    vacuum.setRawProperty("fault", 3);
    expect(vacuum.property("error")).toEqual({
      code: 3,
      message: "Unknown error 3",
    });
  });

  test("maps unknown statuses", () => {
    const { vacuum } = createMiotVacuum(MODEL, d110ch);
    vacuum.setRawProperty("status", 99);
    expect(vacuum.property("state")).toBe("unknown-99");
  });

  test("exposes the fan speeds and water levels from the spec", async () => {
    const { vacuum } = createMiotVacuum(MODEL, d110ch);
    expect(await vacuum.fanSpeeds()).toEqual([
      { value: 0, name: "Silent" },
      { value: 1, name: "Basic" },
      { value: 2, name: "Strong" },
      { value: 3, name: "Full Speed" },
    ]);
    expect(await vacuum.waterBoxModes()).toEqual([
      { value: 1, name: "Level1" },
      { value: 2, name: "Level2" },
      { value: 3, name: "Level3" },
    ]);
  });

  test.each<[string, (v: MiotVacuum) => Promise<unknown>, unknown]>([
    ["activateCleaning", (v) => v.activateCleaning(), { siid: 2, aiid: 1 }],
    ["deactivateCleaning", (v) => v.deactivateCleaning(), { siid: 2, aiid: 2 }],
    ["activateCharging", (v) => v.activateCharging(), { siid: 3, aiid: 1 }],
    ["find", (v) => v.find(), { siid: 23, aiid: 1 }],
  ])("%s calls the action %p", async (_name, run, expected) => {
    const { vacuum, call } = createMiotVacuum(MODEL, d110ch);
    await withTimers(run(vacuum));
    expect(sentCalls(call)[0]).toEqual([
      "action",
      expect.objectContaining({ ...(expected as object), in: [] }),
    ]);
  });

  test("pause stops the cleaning when there's no pause action", async () => {
    const { vacuum, call } = createMiotVacuum(MODEL, d110ch);
    await withTimers(vacuum.pause());
    expect(sentCalls(call)[0]).toEqual([
      "action",
      expect.objectContaining({ siid: 2, aiid: 2 }),
    ]);
  });

  test("changeFanSpeed writes the fan property", async () => {
    const { vacuum, call } = createMiotVacuum(MODEL, d110ch);
    await withTimers(vacuum.changeFanSpeed(3));
    expect(sentCalls(call)[0]).toEqual([
      "set_properties",
      [{ did: "fan_speed", siid: 2, piid: 3, value: 3 }],
    ]);
  });

  test("setWaterBoxMode writes the water property", async () => {
    const { vacuum, call } = createMiotVacuum(MODEL, d110ch);
    await withTimers(vacuum.setWaterBoxMode(2));
    expect(sentCalls(call)[0]).toEqual([
      "set_properties",
      [{ did: "water_level", siid: 2, piid: 8, value: 2 }],
    ]);
  });

  test("rejects when an action fails", async () => {
    const { vacuum } = createMiotVacuum(
      MODEL,
      d110ch,
      {},
      {
        action: { code: -4004 },
      },
    );
    await expect(withTimers(vacuum.activateCleaning())).rejects.toThrow(
      "code -4004",
    );
  });

  test("rejects when a property write fails", async () => {
    const { vacuum } = createMiotVacuum(
      MODEL,
      d110ch,
      {},
      {
        set_properties: [{ did: "fan_speed", code: -4005 }],
      },
    );
    await expect(withTimers(vacuum.changeFanSpeed(1))).rejects.toThrow(
      "code -4005",
    );
  });

  test("getSerialNumber reads device-information:serial-number", async () => {
    const { vacuum } = createMiotVacuum(MODEL, d110ch, { "1.3": "ABC123" });
    await expect(vacuum.getSerialNumber()).resolves.toBe("ABC123");
  });

  test("room cleaning is not supported yet", async () => {
    const { vacuum } = createMiotVacuum(MODEL, d110ch);
    await expect(vacuum.getRoomMap()).resolves.toEqual([]);
    await expect(vacuum.getTimer()).resolves.toEqual([]);
    await expect(vacuum.cleanRooms([1])).rejects.toThrow("not supported");
  });
});

describe("MiotVacuum (other models)", () => {
  test("dreame.vacuum.p2008 uses the standard vacuum service", async () => {
    const { vacuum, call } = createMiotVacuum("dreame.vacuum.p2008", p2008);
    await withTimers(vacuum.activateCleaning());
    expect(sentCalls(call)[0]).toEqual([
      "action",
      expect.objectContaining({ siid: 2, aiid: 1 }),
    ]);
    expect((await vacuum.fanSpeeds()).map((m) => m.name)).toEqual([
      "Silent",
      "Basic",
      "Strong",
      "Full Speed",
    ]);
    // p2008's water level lives in a vendor-specific service only
    expect(await vacuum.waterBoxModes()).toEqual([]);
    await expect(vacuum.setWaterBoxMode(1)).rejects.toThrow("not supported");
  });

  test("mijia.vacuum.v2 uses fan-level (not the cleaning mode) and target-water-level", async () => {
    const { vacuum } = createMiotVacuum("mijia.vacuum.v2", mijiaV2);
    expect((await vacuum.fanSpeeds()).map((m) => m.name)).toEqual([
      "Silence",
      "Stanrd",
      "Middle",
      "Enchance",
    ]);
    expect((await vacuum.waterBoxModes()).map((m) => m.name)).toEqual([
      "Level1",
      "Level2",
      "Level3",
    ]);
  });

  test("ijai.vacuum.v3 doesn't treat the cleaning type as a fan speed", async () => {
    const { vacuum } = createMiotVacuum("ijai.vacuum.v3", ijaiV3);
    expect(await vacuum.fanSpeeds()).toEqual([]);
    await expect(vacuum.changeFanSpeed(1)).rejects.toThrow("not supported");
  });

  test("pauses with pause-sweeping when available", async () => {
    const spec = structuredClone(d110ch) as MiotSpec;
    const vacuumService = service(spec, 2);
    vacuumService.actions = [...(vacuumService.actions ?? [])];
    vacuumService.actions.push({
      iid: 50,
      type: "urn:miot-spec-v2:action:pause-sweeping:0000280C:xiaomi-d110ch:1",
      description: "Pause Sweeping",
      in: [],
      out: [],
    });
    const { vacuum, call } = createMiotVacuum("xiaomi.vacuum.d110ch", spec);
    await withTimers(vacuum.pause());
    expect(sentCalls(call)[0]).toEqual([
      "action",
      { did: "pause_sweeping", siid: 2, aiid: 50, in: [] },
    ]);
  });

  test("viomi.vacuum.v18 (Viomi S9): fan speed via vacuum:mode, pause and dock", async () => {
    const { vacuum, call } = createMiotVacuum("viomi.vacuum.v18", viomiV18, {
      "2.1": 4, // Charging
      "3.1": 100,
    });
    expect((await vacuum.fanSpeeds()).map((m) => m.name)).toEqual([
      "Silent",
      "Basic",
      "Medium",
      "Strong",
    ]);
    await vacuum.poll();
    expect(vacuum.property("state")).toBe("charging");
    await expect(vacuum.charging).resolves.toBe(true);

    call.mockClear();
    await withTimers(vacuum.pause());
    await withTimers(vacuum.activateCharging());
    await withTimers(vacuum.changeFanSpeed(2));
    const sent = sentCalls(call).filter(([m]) => m !== "get_properties");
    expect(sent).toEqual([
      ["action", { did: "pause_sweeping", siid: 2, aiid: 3, in: [] }],
      ["action", { did: "start_charge", siid: 2, aiid: 4, in: [] }],
      ["set_properties", [{ did: "fan_speed", siid: 2, piid: 19, value: 2 }]],
    ]);
  });

  test("derives the charging state from the status when there's no charging-state", async () => {
    const spec = structuredClone(p2008) as MiotSpec;
    const battery = service(spec, 3);
    battery.properties = (battery.properties ?? []).filter((p) => p.iid !== 2);
    const { vacuum } = createMiotVacuum("dreame.vacuum.p2008", spec, {
      "2.1": 6,
    });
    await vacuum.poll();
    expect(vacuum.property("state")).toBe("charging");
    await expect(vacuum.charging).resolves.toBe(true);
  });
});

describe("MiotVacuum cleaning types", () => {
  test("xiaomi.vacuum.d110ch uses vacuum:sweep-mop-type", async () => {
    const { vacuum, call } = createMiotVacuum("xiaomi.vacuum.d110ch", d110ch, {
      "2.6": 4,
    });
    await expect(vacuum.cleaningTypes()).resolves.toEqual([
      { value: 1, name: "Sweep" },
      { value: 2, name: "Mop" },
      { value: 3, name: "Sweep Mop" },
      { value: 4, name: "Sweep Before Mopping" },
    ]);
    await vacuum.poll();
    expect(vacuum.property("cleaningType")).toBe(4);

    call.mockClear();
    await withTimers(vacuum.setCleaningType(3));
    expect(sentCalls(call)[0]).toEqual([
      "set_properties",
      [{ did: "cleaning_type", siid: 2, piid: 6, value: 3 }],
    ]);
  });

  test("ijai.vacuum.v3 uses vacuum:mode (its values are cleaning types)", async () => {
    const { vacuum } = createMiotVacuum("ijai.vacuum.v3", ijaiV3);
    expect((await vacuum.cleaningTypes()).map((m) => m.name)).toEqual([
      "Sweep",
      "Sweep And Mop",
      "Mop",
    ]);
  });

  test("mijia.vacuum.v2: vacuum:mode is not a cleaning type (Auto-clean / Spot-clean…)", async () => {
    const { vacuum } = createMiotVacuum("mijia.vacuum.v2", mijiaV2);
    await expect(vacuum.cleaningTypes()).resolves.toEqual([]);
    await expect(vacuum.setCleaningType(1)).rejects.toThrow("not supported");
  });

  test("dreame.vacuum.p2008: vacuum:mode is the fan speed, not a cleaning type", async () => {
    const { vacuum } = createMiotVacuum("dreame.vacuum.p2008", p2008);
    await expect(vacuum.cleaningTypes()).resolves.toEqual([]);
  });
});
