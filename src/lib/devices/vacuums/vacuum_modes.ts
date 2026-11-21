/**
 * Fan speed and water level values of the vacuums that don't describe them in a MIoT spec (legacy miIO models).
 *
 * Moved from the `models/` folder of homebridge-xiaomi-roborock-vacuum and matterbridge-xiaomi-roborock (same author,
 * MIT-licensed), based on what users reported for each model and firmware version.
 */

/** A selectable mode (fan speed or water level) */
export interface VacuumMode {
  /** Raw value to send to the device (e.g. `changeFanSpeed(value)`) */
  value: number;
  /** Human-readable name */
  name: string;
}

export interface VacuumModes {
  fanSpeeds: VacuumMode[];
  waterBoxModes: VacuumMode[];
  /** Presets of the fan speed, water level and mop route (e.g. SmartPlan), set with `setCleanMotorMode` */
  presets: CleanPreset[];
}

/** A preset of the three cleaning settings, as the Roborock app offers it (e.g. "SmartPlan") */
export interface CleanPreset {
  name: string;
  fanSpeed: number;
  waterBoxMode: number;
  mopRoute: number;
}

const m = (value: number, name: string): VacuumMode => ({ value, name });

export const FAN_SPEEDS = {
  gen1: [m(38, "Quiet"), m(60, "Balanced"), m(77, "Turbo"), m(90, "Max")],
  gen2: [
    m(105, "Mop"),
    m(38, "Quiet"),
    m(60, "Balanced"),
    m(75, "Turbo"),
    m(100, "Max"),
  ],
  "gen2-no_mop": [
    m(38, "Quiet"),
    m(60, "Balanced"),
    m(75, "Turbo"),
    m(100, "Max"),
  ],
  "xiaowa-e202-02": [
    m(41, "Gentle"),
    m(50, "Silent"),
    m(68, "Balanced"),
    m(79, "Turbo"),
    m(100, "Max"),
  ],
  gen3: [m(101, "Quiet"), m(102, "Balanced"), m(103, "Turbo"), m(104, "Max")],
  gen4: [
    m(105, "Soft"),
    m(101, "Quiet"),
    m(102, "Balanced"),
    m(103, "Turbo"),
    m(104, "Max"),
  ],
  "gen4+custom": [
    m(105, "Soft"),
    m(101, "Quiet"),
    m(102, "Balanced"),
    m(103, "Turbo"),
    m(104, "Max"),
    m(106, "Custom"),
  ],
  gen5: [
    m(101, "Quiet"),
    m(102, "Balanced"),
    m(103, "Turbo"),
    m(104, "Max"),
    m(108, "Max+"),
    m(106, "Custom"),
  ],
  // Recent Roborock-app robots: 105 is "Mop only" (no suction), not "Soft". Read from a Saros 20 (a296). Its
  // "SmartPlan" (110 + water 209 + mop route 306) is a preset of the 3 settings, not a fan speed: not listed.
  "gen6-mop": [
    m(105, "Mop"),
    m(101, "Quiet"),
    m(102, "Balanced"),
    m(103, "Turbo"),
    m(104, "Max"),
  ],
  viomi: [m(0, "Silent"), m(1, "Standard"), m(2, "Medium"), m(3, "Turbo")],
  dreame: [m(0, "Quiet"), m(1, "Standard"), m(2, "Strong"), m(3, "Turbo")],
  "dreame.vacuum.mc1808": [
    m(0, "Quiet"),
    m(1, "Default"),
    m(2, "Medium"),
    m(3, "Strong"),
  ],
} satisfies Record<string, VacuumMode[]>;

export const WATER_BOX_MODES = {
  gen1: [m(200, "Off"), m(201, "Light"), m(202, "Medium"), m(203, "High")],
  "gen1+custom": [
    m(200, "Off"),
    m(201, "Light"),
    m(202, "Medium"),
    m(203, "High"),
    m(204, "Custom"),
  ],
  // A slider of 30 levels: level n = 220 + n (221-250); 200 = off ("Vacuum only"). Read from a Saros 20 (a296)
  "custom-30": [
    m(200, "Off"),
    ...Array.from({ length: 30 }, (_, i) => m(221 + i, `Level ${i + 1}`)),
  ],
  dreame: [m(0, "Off"), m(1, "Light"), m(2, "Medium"), m(3, "High")],
} satisfies Record<string, VacuumMode[]>;

interface ModelModes {
  fan: keyof typeof FAN_SPEEDS;
  water?: keyof typeof WATER_BOX_MODES;
  /** Only applies when the firmware is at least this version (`major.minor.patch`) */
  minFirmware?: string;
  presets?: CleanPreset[];
}

// SmartPlan: the robot picks the settings per room. Read from a Saros 20 (a296) and set with `set_clean_motor_mode`
const SMART_PLAN: CleanPreset = {
  name: "SmartPlan",
  fanSpeed: 110,
  waterBoxMode: 209,
  mopRoute: 306,
};

const GEN4_CUSTOM_WITH_WATER: ModelModes = {
  fan: "gen4+custom",
  water: "gen1+custom",
};

/** Per-model modes. When several entries apply, the last one wins. */
const MODELS: Record<string, ModelModes[]> = {
  "rockrobo.vacuum.v1": [{ fan: "gen2-no_mop" }],
  "roborock.vacuum.c1": [{ fan: "gen1" }],
  "roborock.vacuum.m1s": [{ fan: "gen3" }],
  "roborock.vacuum.s5": [
    { fan: "gen2" },
    { fan: "gen4", minFirmware: "3.5.7" },
  ],
  "roborock.vacuum.s5e": [{ fan: "gen4+custom", water: "gen1" }],
  "roborock.vacuum.s6": [{ fan: "gen4" }],
  "roborock.vacuum.t6": [{ fan: "gen3" }],
  "roborock.vacuum.t4": [{ fan: "gen3" }],
  "roborock.vacuum.e2": [{ fan: "xiaowa-e202-02" }],
  "roborock.vacuum.a08": [{ fan: "gen3" }],
  "roborock.vacuum.a09": [GEN4_CUSTOM_WITH_WATER],
  "roborock.vacuum.a10": [GEN4_CUSTOM_WITH_WATER],
  "roborock.vacuum.a11": [GEN4_CUSTOM_WITH_WATER],
  "roborock.vacuum.a15": [GEN4_CUSTOM_WITH_WATER],
  "roborock.vacuum.a27": [{ fan: "gen5", water: "gen1+custom" }],
  "roborock.vacuum.a296": [
    { fan: "gen6-mop", water: "custom-30", presets: [SMART_PLAN] },
  ], // Saros 20 Neo
  "roborock.vacuum.a51": [GEN4_CUSTOM_WITH_WATER],
  "roborock.vacuum.a65": [GEN4_CUSTOM_WITH_WATER],
  "roborock.vacuum.a72": [{ fan: "gen4+custom" }], // Q5 Pro
  "roborock.vacuum.a73": [GEN4_CUSTOM_WITH_WATER],
  "roborock.vacuum.a75": [GEN4_CUSTOM_WITH_WATER],
  "dreame.vacuum.mc1808": [{ fan: "dreame.vacuum.mc1808" }],
  "viomi.vacuum.v7": [{ fan: "viomi" }],
  "viomi.vacuum.v8": [{ fan: "viomi" }],
};

/**
 * Defaults by brand, used when the model is not listed in {@link MODELS}.
 *
 * @param model The device model
 * @returns The default modes for the brand
 */
function brandDefault(model: string): ModelModes {
  if (model.startsWith("viomi.")) return { fan: "viomi" };
  if (model.startsWith("dreame.")) return { fan: "dreame", water: "dreame" };
  return { fan: "gen4" };
}

/**
 * Parses the `major.minor.patch` prefix of a firmware version (e.g. `3.5.8_0008`).
 *
 * @param firmware The firmware version
 * @returns The numeric parts, or `undefined` if it can't be parsed
 */
function parseFirmware(firmware?: string): number[] | undefined {
  const match = firmware?.match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : undefined;
}

/**
 * Whether `firmware` is at least `minimum`.
 *
 * @param firmware The firmware version (e.g. `3.5.8_0008`)
 * @param minimum The minimum version (e.g. `3.5.7`)
 * @returns `true` if the firmware is equal to or newer than the minimum. `false` if unknown.
 */
export function firmwareAtLeast(firmware: string | undefined, minimum: string) {
  const current = parseFirmware(firmware);
  const min = parseFirmware(minimum);
  if (!current || !min) return false;
  for (let i = 0; i < 3; i++) {
    if (current[i] !== min[i]) return current[i] > min[i];
  }
  return true;
}

/**
 * The fan speeds and water levels of a legacy miIO vacuum.
 *
 * @param model The device model
 * @param firmware The firmware version (from `miIO.info`'s `fw_ver`)
 * @returns The modes (copies, safe to modify)
 */
export function resolveVacuumModes(
  model: string,
  firmware?: string,
): VacuumModes {
  const selected = (MODELS[model] ?? []).reduce<ModelModes>(
    (acc, option) =>
      !option.minFirmware || firmwareAtLeast(firmware, option.minFirmware)
        ? option
        : acc,
    brandDefault(model),
  );
  return {
    fanSpeeds: FAN_SPEEDS[selected.fan].map((mode) => ({ ...mode })),
    waterBoxModes: selected.water
      ? WATER_BOX_MODES[selected.water].map((mode) => ({ ...mode }))
      : [],
    presets: (selected.presets ?? []).map((preset) => ({ ...preset })),
  };
}
