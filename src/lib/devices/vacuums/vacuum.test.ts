import getStatus from "../../__fixtures__/roborock.vacuum.s5/get_status.json";
import getConsumable from "../../__fixtures__/roborock.vacuum.s5/get_consumable.json";
import {
  createFakeHandle,
  type FakeResponse,
  sentCalls,
} from "../../test_utils.test.mock";

import { Vacuum } from "./vacuum";

jest.mock("debug", () => jest.fn().mockReturnValue(jest.fn()));

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
    jest.advanceTimersByTimeAsync(5000),
  ]);
  return result;
}

describe("Vacuum (roborock miIO)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("is identified as a vacuum", () => {
    const { vacuum } = createVacuum();
    // Note: abstract-things spells the type as "vaccuum" (sic). Consumers rely on it.
    expect(vacuum.matches("type:vaccuum")).toBe(true);
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
      });
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
      expect(sentCalls(call)[0]).toEqual([method, params]);
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
});
