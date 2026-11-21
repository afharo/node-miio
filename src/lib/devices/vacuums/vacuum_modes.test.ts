import { firmwareAtLeast, resolveVacuumModes } from "./vacuum_modes";

const names = (model: string, firmware?: string) =>
  resolveVacuumModes(model, firmware).fanSpeeds.map((m) => m.name);
const values = (model: string, firmware?: string) =>
  resolveVacuumModes(model, firmware).fanSpeeds.map((m) => m.value);

describe("firmwareAtLeast", () => {
  test.each([
    ["3.5.7_0010", "3.5.7", true],
    ["3.5.8_0008", "3.5.7", true],
    ["3.6.0", "3.5.7", true],
    ["4.0.0", "3.5.7", true],
    ["3.5.6_9999", "3.5.7", false],
    ["3.3.9_003194", "3.5.7", false],
    ["3.10.0", "3.5.7", true],
    [undefined, "3.5.7", false],
    ["garbage", "3.5.7", false],
  ])("%p >= %p is %p", (firmware, minimum, expected) => {
    expect(firmwareAtLeast(firmware, minimum)).toBe(expected);
  });
});

describe("resolveVacuumModes", () => {
  test("roborock.vacuum.s5 uses gen2 on old firmwares", () => {
    expect(values("roborock.vacuum.s5", "3.3.9_003194")).toEqual([
      105, 38, 60, 75, 100,
    ]);
    expect(values("roborock.vacuum.s5")).toEqual([105, 38, 60, 75, 100]);
  });

  test("roborock.vacuum.s5 uses gen4 from firmware 3.5.7", () => {
    expect(values("roborock.vacuum.s5", "3.5.7_000")).toEqual([
      105, 101, 102, 103, 104,
    ]);
  });

  test.each([
    ["rockrobo.vacuum.v1", ["Quiet", "Balanced", "Turbo", "Max"]],
    ["roborock.vacuum.c1", ["Quiet", "Balanced", "Turbo", "Max"]],
    ["roborock.vacuum.e2", ["Gentle", "Silent", "Balanced", "Turbo", "Max"]],
    [
      "roborock.vacuum.a27",
      ["Quiet", "Balanced", "Turbo", "Max", "Max+", "Custom"],
    ],
    [
      "roborock.vacuum.a72",
      ["Soft", "Quiet", "Balanced", "Turbo", "Max", "Custom"],
    ],
    ["dreame.vacuum.mc1808", ["Quiet", "Default", "Medium", "Strong"]],
    ["viomi.vacuum.v8", ["Silent", "Standard", "Medium", "Turbo"]],
  ])("%s", (model, expected) => {
    expect(names(model)).toEqual(expected);
  });

  test("water box modes", () => {
    expect(resolveVacuumModes("roborock.vacuum.s5e").waterBoxModes).toEqual([
      { value: 200, name: "Off" },
      { value: 201, name: "Light" },
      { value: 202, name: "Medium" },
      { value: 203, name: "High" },
    ]);
    expect(
      resolveVacuumModes("roborock.vacuum.a15").waterBoxModes.map(
        (m) => m.value,
      ),
    ).toEqual([200, 201, 202, 203, 204]);
    expect(resolveVacuumModes("roborock.vacuum.s6").waterBoxModes).toEqual([]);
  });

  test.each([
    ["roborock.vacuum.unknown", [105, 101, 102, 103, 104]],
    ["viomi.vacuum.unknown", [0, 1, 2, 3]],
    ["dreame.vacuum.unknown", [0, 1, 2, 3]],
  ])("unknown model %s falls back to the brand default", (model, expected) => {
    expect(values(model)).toEqual(expected);
  });

  test("returns copies", () => {
    resolveVacuumModes("roborock.vacuum.s6").fanSpeeds[0].name = "changed";
    expect(names("roborock.vacuum.s6")[0]).toBe("Soft");
  });
});

describe("roborock.vacuum.a296 (Saros 20), as read from the robot", () => {
  const modes = resolveVacuumModes("roborock.vacuum.a296");

  test("fan speeds: 105 is mop only", () => {
    expect(modes.fanSpeeds).toStrictEqual([
      { value: 105, name: "Mop" },
      { value: 101, name: "Quiet" },
      { value: 102, name: "Balanced" },
      { value: 103, name: "Turbo" },
      { value: 104, name: "Max" },
    ]);
  });

  test("water: off, then 30 levels (221-250)", () => {
    expect(modes.waterBoxModes).toHaveLength(31);
    expect(modes.waterBoxModes[0]).toStrictEqual({ value: 200, name: "Off" });
    expect(modes.waterBoxModes[1]).toStrictEqual({
      value: 221,
      name: "Level 1",
    });
    expect(modes.waterBoxModes.find((m) => m.value === 235)?.name).toBe(
      "Level 15",
    );
    expect(modes.waterBoxModes[30]).toStrictEqual({
      value: 250,
      name: "Level 30",
    });
  });
});

describe("presets", () => {
  test("a296 has SmartPlan (110 / 209 / 306); other models have none", () => {
    expect(resolveVacuumModes("roborock.vacuum.a296").presets).toStrictEqual([
      { name: "SmartPlan", fanSpeed: 110, waterBoxMode: 209, mopRoute: 306 },
    ]);
    expect(resolveVacuumModes("roborock.vacuum.s5").presets).toStrictEqual([]);
  });
});
