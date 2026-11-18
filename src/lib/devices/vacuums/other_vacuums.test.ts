import { createFakeHandle, sentCalls } from "../../test_utils.test.mock";

import { DreameVacuum } from "./dreamevacuum";
import { MijiaVacuum } from "./mijiavacuum";
import { ViomiVacuum } from "./viomivacuum";

jest.mock("debug", () => jest.fn().mockReturnValue(jest.fn()));

async function withTimers<T>(promise: Promise<T>): Promise<T> {
  const [result] = await Promise.all([
    promise,
    jest.advanceTimersByTimeAsync(5000),
  ]);
  return result;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("MijiaVacuum", () => {
  const status = { get_status: [{ state: 5 }], get_consumable: [{}] };

  test("cleans rooms with app_segment_clean when supported", async () => {
    const { handle, call } = createFakeHandle("roborock.vacuum.m1s", {
      ...status,
      app_segment_clean: ["ok"],
    });
    await withTimers(new MijiaVacuum(handle).cleanRooms([16]));
    expect(sentCalls(call)[0]).toEqual(["app_segment_clean", [16]]);
  });

  test("falls back to set_mode_withroom when app_segment_clean fails", async () => {
    const { handle, call } = createFakeHandle("roborock.vacuum.m1s", {
      ...status,
      app_segment_clean: () => {
        throw new Error("unknown method");
      },
      set_mode_withroom: ["ok"],
    });
    await withTimers(new MijiaVacuum(handle).cleanRooms([16, 17]));
    expect(sentCalls(call)).toContainEqual([
      "set_mode_withroom",
      [0, 1, 2, 16, 17],
    ]);
  });
});

describe("ViomiVacuum", () => {
  const MODEL = "viomi.vacuum.v8";

  test("maps get_prop values into properties", async () => {
    const { handle, call } = createFakeHandle(MODEL, {
      get_prop: (props: string[]) =>
        props.map(
          (p) =>
            ({
              err_state: 0,
              run_state: 5,
              battary_life: 87,
              s_time: 10,
              s_area: 2000000,
              suction_grade: 1,
              main_brush_life: 90,
              side_brush_life: 80,
              hypa_life: 70,
              mop_life: 60,
              hw_info: "1.0.1",
            })[p],
        ),
    });
    const vacuum = new ViomiVacuum(handle);
    await vacuum.poll();
    expect(sentCalls(call)[0][0]).toBe("get_prop");
    expect(vacuum.properties).toEqual({
      state: "charging",
      batteryLevel: 87,
      cleanTime: 10,
      cleanArea: 2,
      fanSpeed: 1,
      mainBrushWorkTime: 90,
      sideBrushWorkTime: 80,
      filterWorkTime: 70,
      mopWorkTime: 60,
      hw_info: "1.0.1",
    });
  });

  test.each<[string, (v: ViomiVacuum) => Promise<unknown>, string, unknown]>([
    [
      "activateCleaning",
      (v) => v.activateCleaning(),
      "set_mode_withroom",
      [0, 1, 0],
    ],
    ["pause", (v) => v.pause(), "set_mode_withroom", [0, 2, 0]],
    ["deactivateCleaning", (v) => v.deactivateCleaning(), "set_mode", [0]],
    ["changeFanSpeed", (v) => v.changeFanSpeed(2), "set_suction", [2]],
    [
      "cleanRooms",
      (v) => v.cleanRooms([3, 4]),
      "set_mode_withroom",
      [0, 1, 2, 3, 4],
    ],
    ["find", (v) => v.find(), "find_me", [""]],
  ])("%s sends %p", async (_name, run, method, params) => {
    const { handle, call } = createFakeHandle(MODEL, {
      [method]: ["ok"],
      get_prop: (props: string[]) => props.map(() => 0),
    });
    await withTimers(run(new ViomiVacuum(handle)));
    expect(sentCalls(call)[0]).toEqual([method, params]);
  });

  test("activateCharging pauses and then sends set_charge", async () => {
    const { handle, call } = createFakeHandle(MODEL, {
      set_mode_withroom: ["ok"],
      set_charge: ["ok"],
      get_prop: (props: string[]) => props.map(() => 0),
    });
    await withTimers(new ViomiVacuum(handle).activateCharging());
    const methods = sentCalls(call).map(([m]) => m);
    expect(methods.indexOf("set_mode_withroom")).toBeLessThan(
      methods.indexOf("set_charge"),
    );
  });
});

describe("DreameVacuum", () => {
  test.each([
    // [model, expected siid/piid of the state property, expected siid of start/stop]
    ["dreame.vacuum.mc1808", { siid: 3, piid: 2 }, 3],
    ["dreame.vacuum.p2008", { siid: 2, piid: 1 }, 4],
  ])("%s reads properties with get_properties", async (model, statePid) => {
    const { handle, call } = createFakeHandle(model, {
      get_properties: (props: Array<{ did: string }>) =>
        props.map((p) => ({
          ...p,
          code: p.did === "device_status" ? 0 : -4001,
          value: 6,
        })),
    });
    const vacuum = new DreameVacuum(handle);
    await vacuum.poll();

    const [method, params] = sentCalls(call)[0];
    expect(method).toBe("get_properties");
    expect(params).toContainEqual({ did: "device_status", ...statePid });
    // Only properties responding with `code: 0` are stored
    expect(vacuum.properties).toEqual({ state: "charging" });
  });

  test.each([
    ["dreame.vacuum.mc1808", 3, 2, 17],
    ["dreame.vacuum.p2008", 4, 3, 7],
  ])(
    "%s sends MIoT actions",
    async (model, cleanSiid, homeSiid, locateSiid) => {
      const { handle, call } = createFakeHandle(model, {
        action: { code: 0 },
      });
      const vacuum = new DreameVacuum(handle);
      await vacuum.activateCleaning();
      await vacuum.deactivateCleaning();
      await vacuum.activateCharging();
      await vacuum.find();
      expect(sentCalls(call)).toEqual([
        ["action", { did: "start_clean", siid: cleanSiid, aiid: 1, in: [] }],
        ["action", { did: "stop_clean", siid: cleanSiid, aiid: 2, in: [] }],
        ["action", { did: "home", siid: homeSiid, aiid: 1, in: [] }],
        ["action", { did: "locate", siid: locateSiid, aiid: 1, in: [] }],
      ]);
    },
  );
});
