import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

import getStatus from "../../__fixtures__/roborock.vacuum.s5/get_status.json" with { type: "json" };
import getConsumable from "../../__fixtures__/roborock.vacuum.s5/get_consumable.json" with { type: "json" };
import {
  createFakeHandle,
  type FakeResponse,
  sentCalls,
} from "../../test_utils.test.mock.js";

import { MOP_ROUTES, Vacuum } from "./vacuum.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

vi.mock("debug", () => ({ default: vi.fn(() => vi.fn()) }));

const MODEL = "roborock.vacuum.s5";

function createVacuum(responses: Record<string, FakeResponse> = {}) {
  const { handle, call } = createFakeHandle(MODEL, {
    get_status: getStatus,
    get_consumable: getConsumable,
    ...responses,
  });
  return { vacuum: new Vacuum(handle), call };
}

/**
 * Runs the promise while advancing the fake timers, so the `refreshDelay` used by most commands doesn't slow down tests.
 *
 * @param promise The promise to resolve
 * @returns The resolved value of the promise
 */
async function withTimers<T>(promise: Promise<T>): Promise<T> {
  const [result] = await Promise.all([
    promise,
    vi.advanceTimersByTimeAsync(5000),
  ]);
  return result;
}

describe("Vacuum (roborock miIO)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("is identified as a vacuum", () => {
    const { vacuum } = createVacuum();
    expect(vacuum.matches("type:vacuum")).toBe(true);
    expect(vacuum.matches("type:miio:vacuum")).toBe(true);
    expect(vacuum.matches("type:miio:vacuum")).toBe(true);
    expect(vacuum.miioModel).toBe(MODEL);
  });

  describe("properties", () => {
    test("maps get_status and get_consumable into properties", async () => {
      const { vacuum, call } = createVacuum();
      await vacuum.poll();

      expect(sentCalls(call)).toEqual([
        ["get_status", []],
        ["get_consumable", []],
      ]);
      // Properties without a value (undefined/null) are not stored
      expect(vacuum.properties).toEqual({
        state: "charging",
        batteryLevel: 100,
        cleanTime: 15,
        cleanArea: 0.14,
        fanSpeed: 102,
        cleaningMode: "idle",
        in_returning: 0,
        mainBrushWorkTime: 32453,
        sideBrushWorkTime: 32453,
        filterWorkTime: 32453,
        sensorDirtyTime: 13110,
        waterBoxAttached: false,
      });
    });

    test("currentSegment: the segment being cleaned (cleaning_info), undefined when none", async () => {
      const { vacuum } = createVacuum();
      const events: unknown[] = [];
      vacuum.on("stateChanged", (change) => events.push(change));
      vacuum.setRawProperty("cleaning_info", {
        target_segment_id: -1,
        segment_id: 10,
        fan_power: 102,
      });
      expect(vacuum.property("currentSegment")).toBe(10);
      await vi.advanceTimersByTimeAsync(100);
      expect(events).toContainEqual({ key: "currentSegment", value: 10 });
      vacuum.setRawProperty("cleaning_info", { segment_id: -1 });
      expect(vacuum.property("currentSegment")).toBeUndefined();
      vacuum.setRawProperty("cleaning_info", undefined);
      expect(vacuum.property("currentSegment")).toBeUndefined();
    });

    test.each([
      ["water_box_mode", "waterBoxMode", 235],
      ["mop_mode", "mopRoute", 306],
    ])("emits stateChanged for %p (as %p)", async (raw, name, value) => {
      const { vacuum } = createVacuum();
      const events: unknown[] = [];
      vacuum.on("stateChanged", (change) => events.push(change));
      vacuum.setRawProperty(raw, value);
      expect(vacuum.property(name)).toBe(value);
      await vi.advanceTimersByTimeAsync(100);
      expect(events).toContainEqual({ key: name, value });
    });

    test.each([
      ["water_box_status", "waterBoxAttached"],
      ["water_shortage_status", "waterShortage"],
      ["dry_status", "mopDrying"],
    ])("maps %p to %p and exposes it in the state", async (raw, name) => {
      const { vacuum } = createVacuum();
      const events: unknown[] = [];
      vacuum.on("stateChanged", (change) => events.push(change));

      vacuum.setRawProperty(raw, 1);
      expect(vacuum.property(name)).toBe(true);
      await expect(vacuum.state()).resolves.toMatchObject({ [name]: true });
      // The events are emitted asynchronously
      await vi.advanceTimersByTimeAsync(100);
      expect(events).toContainEqual({ key: name, value: true });

      vacuum.setRawProperty(raw, 0);
      expect(vacuum.property(name)).toBe(false);
      await expect(vacuum.state()).resolves.toMatchObject({ [name]: false });
      await vi.advanceTimersByTimeAsync(100);
      expect(events).toContainEqual({ key: name, value: false });
    });

    test("doesn't report the dock properties when the model doesn't have them", async () => {
      const { vacuum } = createVacuum();
      await vacuum.poll();
      expect(vacuum.property("waterShortage")).toBeUndefined();
      expect(vacuum.property("mopDrying")).toBeUndefined();
    });

    test("accepts get_status responses that are not wrapped in an array", async () => {
      const { vacuum } = createVacuum({
        get_status: getStatus[0],
        get_consumable: getConsumable[0],
      });
      await vacuum.poll();
      expect(vacuum.property("batteryLevel")).toBe(100);
      expect(vacuum.property("mainBrushWorkTime")).toBe(32453);
    });

    test.each([
      [1, "initiating"],
      [2, "sleeping"],
      [3, "idle"],
      [4, "remote-control"],
      [5, "cleaning"],
      [6, "returning"],
      [7, "manual-mode"],
      [8, "charging"],
      [9, "charging-error"],
      [10, "paused"],
      [11, "spot-cleaning"],
      [12, "error"],
      [13, "shutting-down"],
      [14, "updating"],
      [15, "docking"],
      [16, "going-to-location"],
      [17, "zone-cleaning"],
      [18, "room-cleaning"],
      [22, "dust-collection"],
      [23, "washing-mop"],
      [25, "washing-mop"],
      [26, "returning-to-wash-mop"],
      [100, "fully-charged"],
      [42, "unknown-42"],
    ])("maps state %p to %p", (code, state) => {
      const { vacuum } = createVacuum();
      vacuum.setRawProperty("state", code);
      expect(vacuum.property("state")).toBe(state);
    });

    test("maps error_code 0 to no error", () => {
      const { vacuum } = createVacuum();
      vacuum.setRawProperty("error_code", 0);
      expect(vacuum.property("error")).toBeUndefined();
    });

    test.each([
      [1, { code: 1, message: "Laser sensor fault" }],
      [24, { code: 24, message: "No-go zone or invisible wall detected" }],
      [254, { code: 254, message: "Bin full" }],
      [9999, { code: 9999, message: "Unknown error 9999" }],
    ])("maps error_code %p", (code, error) => {
      const { vacuum } = createVacuum();
      vacuum.setRawProperty("error_code", code);
      expect(vacuum.property("error")).toEqual(error);
    });

    test.each([
      [0, "idle"],
      [1, "cleaning"],
      [2, "zone-cleaning"],
      [3, "room-cleaning"],
      [9, "unknown-9"],
    ])("maps in_cleaning %p to cleaningMode %p", (value, mode) => {
      const { vacuum } = createVacuum();
      vacuum.setRawProperty("in_cleaning", value);
      expect(vacuum.property("cleaningMode")).toBe(mode);
    });

    test("updates the cleaning and charging state on state changes", async () => {
      const { vacuum } = createVacuum();
      vacuum.setRawProperty("state", 5);
      await expect(vacuum.cleaning()).resolves.toBe(true);
      await expect(vacuum.charging).resolves.toBe(false);

      vacuum.setRawProperty("state", 8);
      await expect(vacuum.cleaning()).resolves.toBe(false);
      await expect(vacuum.charging).resolves.toBe(true);
    });

    test("updates the battery level and fan speed", async () => {
      const { vacuum } = createVacuum();
      vacuum.setRawProperty("battery", 42);
      vacuum.setRawProperty("fan_power", 103);
      await expect(vacuum.batteryLevel()).resolves.toBe(42);
      await expect(vacuum.fanSpeed()).resolves.toBe(103);
    });
  });

  describe("commands", () => {
    test.each<[string, (v: Vacuum) => Promise<unknown>, string, unknown]>([
      ["activateCleaning", (v) => v.activateCleaning(), "app_start", []],
      ["pause", (v) => v.pause(), "app_pause", []],
      ["deactivateCleaning", (v) => v.deactivateCleaning(), "app_stop", []],
      ["activateSpotClean", (v) => v.activateSpotClean(), "app_spot", []],
      [
        "startDustCollection",
        (v) => v.startDustCollection(),
        "app_start_collect_dust",
        [],
      ],
      [
        "stopDustCollection",
        (v) => v.stopDustCollection(),
        "app_stop_collect_dust",
        [],
      ],
      [
        "changeFanSpeed",
        (v) => v.changeFanSpeed(103),
        "set_custom_mode",
        [103],
      ],
      [
        "setWaterBoxMode",
        (v) => v.setWaterBoxMode(202),
        "set_water_box_custom_mode",
        [202],
      ],
      [
        "cleanRooms",
        (v) => v.cleanRooms([16, 17]),
        "app_segment_clean",
        [16, 17],
      ],
      [
        "resumeCleanRooms",
        (v) => v.resumeCleanRooms([16]),
        "resume_segment_clean",
        [16],
      ],
      [
        "cleanZones",
        (v) => v.cleanZones([[25000, 25000, 26000, 26000, 1]]),
        "app_zoned_clean",
        [[25000, 25000, 26000, 26000, 1]],
      ],
      [
        "sendToLocation",
        (v) => v.sendToLocation(25500, 25500),
        "app_goto_target",
        [25500, 25500],
      ],
      ["find", (v) => v.find(), "find_me", [""]],
    ])("%s sends %p", async (_name, run, method, params) => {
      const { vacuum, call } = createVacuum({ [method]: ["ok"] });
      await withTimers(run(vacuum));
      expect(sentCalls(call)).toContainEqual([method, params]);
    });

    test("commands that refresh the state poll the device afterwards", async () => {
      const { vacuum, call } = createVacuum({ app_start: ["ok"] });
      await withTimers(vacuum.activateCleaning());
      expect(sentCalls(call).map(([method]) => method)).toEqual([
        "app_start",
        "get_status",
        "get_consumable",
      ]);
      expect(vacuum.property("state")).toBe("charging");
    });

    test.each([[["ok"]], [["OK"]], [0]])(
      "accepts the successful response %p",
      async (response) => {
        const { vacuum } = createVacuum({ app_start: response });
        await expect(
          withTimers(vacuum.activateCleaning()),
        ).resolves.toBeUndefined();
      },
    );

    test("rejects when the device does not respond ok", async () => {
      const { vacuum } = createVacuum({ app_start: ["error"] });
      await expect(withTimers(vacuum.activateCleaning())).rejects.toThrow(
        "Could not complete call to device",
      );
    });

    test("activateCharging pauses before going home", async () => {
      const { vacuum, call } = createVacuum({
        app_pause: ["ok"],
        app_charge: ["ok"],
      });
      await withTimers(vacuum.activateCharging());
      const methods = sentCalls(call).map(([method]) => method);
      expect(methods.indexOf("app_pause")).toBeLessThan(
        methods.indexOf("app_charge"),
      );
      expect(methods).not.toContain("app_stop");
    });

    test("activateCharging stops the cleaning when pausing fails", async () => {
      const { vacuum, call } = createVacuum({
        app_pause: ["error"],
        app_stop: ["ok"],
        app_charge: ["ok"],
      });
      await withTimers(vacuum.activateCharging());
      const methods = sentCalls(call).map(([method]) => method);
      expect(methods).toContain("app_stop");
      expect(methods[methods.length - 3]).toBe("app_charge");
    });
  });

  describe("queries", () => {
    test("getSerialNumber", async () => {
      const { vacuum } = createVacuum({
        get_serial_number: [{ serial_number: "18624/4AAA00123" }],
      });
      await expect(vacuum.getSerialNumber()).resolves.toBe("18624/4AAA00123");
    });

    test("getRoomMap", async () => {
      const rooms = [
        [16, "1"],
        [17, "2"],
      ];
      const { vacuum } = createVacuum({ get_room_mapping: rooms });
      await expect(vacuum.getRoomMap()).resolves.toEqual(rooms);
    });

    test("getWaterBoxMode", async () => {
      const { vacuum } = createVacuum({ get_water_box_custom_mode: [202] });
      await expect(withTimers(vacuum.getWaterBoxMode())).resolves.toBe(202);
    });

    test("getWaterBoxMode: newer firmwares respond an object (e.g. Saros 20)", async () => {
      const { vacuum } = createVacuum({
        get_water_box_custom_mode: { water_box_mode: 235, distance_off: 0 },
      });
      await expect(withTimers(vacuum.getWaterBoxMode())).resolves.toBe(235);
    });

    test("getHistory", async () => {
      const { vacuum } = createVacuum({
        get_clean_summary: [174145, 2410150000, 82, [1488240000, 1488153600]],
      });
      await expect(vacuum.getHistory()).resolves.toEqual({
        count: 82,
        days: [new Date(1488240000 * 1000), new Date(1488153600 * 1000)],
      });
    });

    test("getHistoryForDay", async () => {
      const { vacuum, call } = createVacuum({
        get_clean_record: [[1488347071, 1488349211, 2047, 31545000, 0, 1]],
      });
      const day = new Date(1488240000 * 1000);
      await expect(vacuum.getHistoryForDay(day)).resolves.toEqual({
        day,
        history: [
          {
            start: new Date(1488347071 * 1000),
            end: new Date(1488349211 * 1000),
            duration: 2047,
            area: 31.545,
            complete: true,
          },
        ],
      });
      expect(sentCalls(call)[0]).toEqual(["get_clean_record", [1488240000]]);
    });
  });

  describe("room cleaning with repeats", () => {
    test("uses the list format by default", async () => {
      const { vacuum, call } = createVacuum({ app_segment_clean: ["ok"] });
      await withTimers(vacuum.cleanRooms([16, 17]));
      expect(sentCalls(call)[0]).toEqual(["app_segment_clean", [16, 17]]);
    });

    test("uses the object format when repeating", async () => {
      const { vacuum, call } = createVacuum({ app_segment_clean: ["ok"] });
      await withTimers(vacuum.cleanRooms([16, 17], { repeat: 2 }));
      expect(sentCalls(call)[0]).toEqual([
        "app_segment_clean",
        [{ segments: [16, 17], repeat: 2 }],
      ]);
    });
  });

  describe("modes", () => {
    test("fan speeds depend on the firmware (and miIO.info is called once)", async () => {
      const { vacuum, call } = createVacuum({
        "miIO.info": { model: MODEL, fw_ver: "3.5.8_0008" },
      });
      await expect(vacuum.fanSpeeds()).resolves.toEqual([
        { value: 105, name: "Soft" },
        { value: 101, name: "Quiet" },
        { value: 102, name: "Balanced" },
        { value: 103, name: "Turbo" },
        { value: 104, name: "Max" },
      ]);
      await expect(vacuum.waterBoxModes()).resolves.toEqual([]);
      expect(sentCalls(call).filter(([m]) => m === "miIO.info")).toHaveLength(
        1,
      );
    });

    test("falls back to the model's default when miIO.info fails", async () => {
      const { vacuum } = createVacuum({
        "miIO.info": () => {
          throw new Error("timeout");
        },
      });
      const speeds = await vacuum.fanSpeeds();
      expect(speeds.map((m) => m.value)).toEqual([105, 38, 60, 75, 100]);
    });
  });

  describe("do not disturb", () => {
    test("getDoNotDisturb", async () => {
      const { vacuum } = createVacuum({
        get_dnd_timer: [
          {
            start_hour: 22,
            start_minute: 0,
            end_hour: 8,
            end_minute: 5,
            enabled: 1,
          },
        ],
      });
      await expect(vacuum.getDoNotDisturb()).resolves.toEqual({
        enabled: true,
        start: "22:00",
        end: "08:05",
      });
    });

    test("setDoNotDisturb", async () => {
      const { vacuum, call } = createVacuum({ set_dnd_timer: ["ok"] });
      await vacuum.setDoNotDisturb("22:30", "7:00");
      expect(sentCalls(call)).toEqual([["set_dnd_timer", [22, 30, 7, 0]]]);
    });

    test.each(["24:00", "12:60", "noon", "1230"])(
      "setDoNotDisturb rejects invalid times (%p)",
      async (time) => {
        const { vacuum, call } = createVacuum();
        await expect(vacuum.setDoNotDisturb(time, "08:00")).rejects.toThrow(
          "Invalid time",
        );
        expect(call).not.toHaveBeenCalled();
      },
    );

    test("disableDoNotDisturb", async () => {
      const { vacuum, call } = createVacuum({ close_dnd_timer: ["ok"] });
      await vacuum.disableDoNotDisturb();
      expect(sentCalls(call)).toEqual([["close_dnd_timer", []]]);
    });
  });

  describe("carpet mode", () => {
    const carpet = {
      enable: 0,
      current_high: 500,
      current_integral: 450,
      current_low: 400,
      stall_time: 10,
    };

    test("getCarpetMode", async () => {
      const { vacuum } = createVacuum({ get_carpet_mode: [carpet] });
      await expect(vacuum.getCarpetMode()).resolves.toBe(false);
    });

    test("setCarpetMode keeps the current settings", async () => {
      const { vacuum, call } = createVacuum({
        get_carpet_mode: [carpet],
        set_carpet_mode: ["ok"],
      });
      await vacuum.setCarpetMode(true);
      expect(sentCalls(call)[1]).toEqual([
        "set_carpet_mode",
        [{ ...carpet, enable: 1 }],
      ]);
    });
  });

  describe("other settings", () => {
    test("mop route", async () => {
      const { vacuum, call } = createVacuum({
        get_mop_mode: [300],
        set_mop_mode: ["ok"],
      });
      await expect(vacuum.getMopRoute()).resolves.toBe(MOP_ROUTES.standard);
      await vacuum.setMopRoute(MOP_ROUTES.deep);
      expect(sentCalls(call)[1]).toEqual(["set_mop_mode", [301]]);
    });

    test("setCleanMotorMode sets the 3 settings at once (e.g. SmartPlan)", async () => {
      const { vacuum, call } = createVacuum({ set_clean_motor_mode: ["ok"] });
      await withTimers(
        vacuum.setCleanMotorMode({
          fanSpeed: 110,
          waterBoxMode: 209,
          mopRoute: 306,
        }),
      );
      expect(sentCalls(call)).toContainEqual([
        "set_clean_motor_mode",
        [{ fan_power: 110, water_box_mode: 209, mop_mode: 306 }],
      ]);
    });

    test("mopRoute: the mop_mode of the status", () => {
      const { vacuum } = createVacuum();
      vacuum.setRawProperty("mop_mode", 306);
      expect(vacuum.property("mopRoute")).toBe(MOP_ROUTES.smartPlan);
    });

    test("cleanPresets: none for models without presets", async () => {
      const { vacuum } = createVacuum({
        "miIO.info": { model: MODEL, fw_ver: "1" },
      });
      await expect(vacuum.cleanPresets()).resolves.toStrictEqual([]);
    });

    test("multi-floor maps", async () => {
      const { vacuum, call } = createVacuum({
        get_multi_maps_list: [
          {
            max_multi_map: 4,
            max_bak_map: 1,
            multi_map_count: 2,
            map_info: [
              {
                mapFlag: 0,
                add_time: 1700000000,
                length: 9,
                name: "Ground floor",
              },
              { mapFlag: 1, add_time: 1700000001, length: 5, name: "Upstairs" },
            ],
          },
        ],
        load_multi_map: ["ok"],
      });
      await expect(vacuum.getMaps()).resolves.toEqual([
        { id: 0, name: "Ground floor" },
        { id: 1, name: "Upstairs" },
      ]);
      await vacuum.loadMap(1);
      expect(sentCalls(call)[1]).toEqual(["load_multi_map", [1]]);
    });

    test("multi-floor maps: none on models that don't have them (S5)", async () => {
      const { vacuum } = createVacuum({
        get_multi_maps_list: "unknown_method",
      });
      await expect(vacuum.getMaps()).resolves.toEqual([]);
    });

    test("map backups, newest first (replayed from a roborock.vacuum.s5)", async () => {
      const { vacuum, call } = createVacuum({
        get_recover_maps: [
          [1, 1791368336],
          [3, 1761993118],
          [2, 1791189835],
        ],
        recover_map: ["ok"],
      });
      await expect(vacuum.getBackupMaps()).resolves.toEqual([
        { id: 1, savedAt: new Date(1791368336000) },
        { id: 2, savedAt: new Date(1791189835000) },
        { id: 3, savedAt: new Date(1761993118000) },
      ]);
      await vacuum.loadBackupMap(2);
      expect(sentCalls(call)[1]).toEqual(["recover_map", [2]]);
    });

    test("map backups: none on models without them", async () => {
      const { vacuum } = createVacuum({ get_recover_maps: "unknown_method" });
      await expect(vacuum.getBackupMaps()).resolves.toEqual([]);
      const { vacuum: other } = createVacuum({
        get_recover_maps: [[1, null], "x"],
      });
      await expect(other.getBackupMaps()).resolves.toEqual([]);
    });

    test("getMapName retries while the vacuum answers retry", async () => {
      let attempts = 0;
      const { vacuum } = createVacuum({
        get_map_v1: () => (++attempts < 3 ? ["retry"] : ["robomap%2F1%2F2"]),
      });
      await expect(withTimers(vacuum.getMapName())).resolves.toBe(
        "robomap%2F1%2F2",
      );
      expect(attempts).toBe(3);
    });

    test("getMapName waits while the vacuum is locating itself", async () => {
      // A roborock.vacuum.s5 answers "locating" at the start of a cleaning: it's not a map name
      let attempts = 0;
      const { vacuum } = createVacuum({
        get_map_v1: () =>
          ++attempts < 2 ? ["locating"] : ["robomap%2F96818260%2F1"],
      });
      await expect(withTimers(vacuum.getMapName())).resolves.toBe(
        "robomap%2F96818260%2F1",
      );
      expect(attempts).toBe(2);
    });

    test("getMapName gives up after the retries", async () => {
      const { vacuum } = createVacuum({ get_map_v1: ["retry"] });
      await expect(
        withTimers(vacuum.getMapName({ retries: 2, delayMs: 10 })),
      ).rejects.toThrow("didn't return the map name");
    });

    test("getCloudMap: map name → cloud URL → download → parse", async () => {
      const { vacuum } = createVacuum({ get_map_v1: ["robomap%2F1%2F2"] });
      const file = fs.readFileSync(
        path.join(
          moduleDir,
          "../../__fixtures__/maps/roborock/S8_FW1286_with_obstacles.bin.gz",
        ),
      );
      const cloud = {
        getMapFileUrl: vi.fn().mockResolvedValue("https://files/map.gz"),
        download: vi.fn().mockResolvedValue(file),
      };
      const map = await withTimers(vacuum.getCloudMap(cloud, "de"));
      expect(cloud.getMapFileUrl).toHaveBeenCalledWith("de", "robomap%2F1%2F2");
      expect(cloud.download).toHaveBeenCalledWith("https://files/map.gz");
      expect(map.currentRoom).toBe(17);
    });

    test("mop washing", async () => {
      const { vacuum, call } = createVacuum({
        app_start_wash: ["ok"],
        app_stop_wash: ["ok"],
      });
      await vacuum.startMopWash();
      await vacuum.stopMopWash();
      expect(sentCalls(call)).toEqual([
        ["app_start_wash", []],
        ["app_stop_wash", []],
      ]);
    });

    test("mop drying", async () => {
      const { vacuum, call } = createVacuum({
        app_set_dryer_status: ["ok"],
      });
      await withTimers(vacuum.startMopDrying());
      await withTimers(vacuum.stopMopDrying());
      expect(
        sentCalls(call).filter(([method]) => method === "app_set_dryer_status"),
      ).toEqual([
        ["app_set_dryer_status", { status: 1 }],
        ["app_set_dryer_status", { status: 0 }],
      ]);
      expect(call.mock.calls[0][2]).toMatchObject({ refresh: ["mopDrying"] });
    });

    test("resetConsumable refreshes the related property", async () => {
      const { vacuum, call } = createVacuum({ reset_consumable: ["ok"] });
      await withTimers(vacuum.resetConsumable("filter_work_time"));
      expect(sentCalls(call)[0]).toEqual([
        "reset_consumable",
        ["filter_work_time"],
      ]);
      expect(call.mock.calls[0][2]).toMatchObject({
        refresh: ["filterWorkTime"],
      });
    });

    test("sound volume", async () => {
      const { vacuum, call } = createVacuum({
        get_sound_volume: [90],
        change_sound_volume: ["ok"],
      });
      await expect(vacuum.getSoundVolume()).resolves.toBe(90);
      await vacuum.setSoundVolume(42.4);
      expect(sentCalls(call)[1]).toEqual(["change_sound_volume", [42]]);
      await expect(vacuum.setSoundVolume(101)).rejects.toThrow(
        "Invalid volume",
      );
    });
  });
});

describe("Vacuum: leaving a preset (Saros 20, a296)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /**
   * @param status The robot's status
   * @returns A Saros 20 on that status
   */
  function saros(status: Record<string, number>) {
    const { handle, call } = createFakeHandle("roborock.vacuum.a296", {
      get_status: [{ ...getStatus[0], ...status }],
      get_consumable: getConsumable,
      "miIO.info": { model: "roborock.vacuum.a296", fw_ver: "02.32.54" },
      set_custom_mode: ["ok"],
      set_water_box_custom_mode: ["ok"],
      set_clean_motor_mode: ["ok"],
    });
    return { vacuum: new Vacuum(handle), call };
  }

  /**
   * @param promise The promise to resolve while advancing the fake timers
   * @returns Its result
   */
  async function run<T>(promise: Promise<T>) {
    const result = promise;
    await vi.advanceTimersByTimeAsync(5000);
    return result;
  }

  test("on SmartPlan, a fan speed leaves it with set_clean_motor_mode (middle water, standard route)", async () => {
    const { vacuum, call } = saros({
      fan_power: 110,
      water_box_mode: 209,
      mop_mode: 306,
    });
    await run(vacuum.init());
    await run(vacuum.changeFanSpeed(104));
    expect(sentCalls(call)).toContainEqual([
      "set_clean_motor_mode",
      [{ fan_power: 104, water_box_mode: 235, mop_mode: 300 }],
    ]);
    expect(sentCalls(call).map(([m]) => m)).not.toContain("set_custom_mode");
  });

  test("on SmartPlan, a water level leaves it with set_clean_motor_mode (balanced fan, standard route)", async () => {
    const { vacuum, call } = saros({
      fan_power: 110,
      water_box_mode: 209,
      mop_mode: 306,
    });
    await run(vacuum.init());
    await run(vacuum.setWaterBoxMode(221));
    expect(sentCalls(call)).toContainEqual([
      "set_clean_motor_mode",
      [{ fan_power: 102, water_box_mode: 221, mop_mode: 300 }],
    ]);
  });

  test("without a preset on, the usual commands", async () => {
    const { vacuum, call } = saros({
      fan_power: 102,
      water_box_mode: 235,
      mop_mode: 300,
    });
    await run(vacuum.init());
    await run(vacuum.changeFanSpeed(104));
    await run(vacuum.setWaterBoxMode(221));
    const methods = sentCalls(call).map(([m]) => m);
    expect(methods).toContain("set_custom_mode");
    expect(methods).toContain("set_water_box_custom_mode");
    expect(methods).not.toContain("set_clean_motor_mode");
  });
});
