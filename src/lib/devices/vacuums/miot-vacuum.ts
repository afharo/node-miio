import { ChargingState, AutonomousCharging } from "abstract-things";
import {
  Vacuum as ATVacuum,
  AdjustableFanSpeed,
  AutonomousCleaning,
} from "abstract-things/climate";

import { MiioApi } from "../../device";
import { BatteryLevel } from "../capabilities/battery-level";
import type { DeviceHandle } from "../../management";
import {
  callAction,
  getProperties,
  type MiotCaller,
  type MiotPropertyRequest,
  setProperty,
} from "../../miot/miot_api";
import {
  isReadable,
  isWritable,
  type MiotSpec,
  MiotSpecIndex,
  type MiotValueListItem,
  parseUrn,
  STANDARD_NAMESPACE,
  type ResolvedAction,
  type ResolvedProperty,
} from "../../miot/miot_spec";

import { isCleaningState } from "./vacuum_states";
import type { VacuumMode } from "./vacuum_modes";
import { clearErrorOnRecovery } from "./vacuum_errors";

/** A selectable mode (fan speed or water level), as described by the spec */
export type MiotMode = VacuumMode;

/**
 * Candidate properties for the fan speed, in order of preference.
 * Many specs include placeholder lists (e.g. `[Auto, Level1]`), so only lists with at least 3 entries are considered.
 */
const FAN_SPEED_CANDIDATES = [
  "fan-level",
  "suction-level",
  "mode",
  "speed-level",
];
const WATER_LEVEL_CANDIDATES = [
  "mop-water-output-level",
  "target-water-level",
  "water-level",
];
/** `vacuum:mode` is sometimes the cleaning type (e.g. Sweep / Mop / Spot-clean) instead of the fan speed */
const NOT_A_FAN_SPEED = /sweep|mop|clean/i;
/**
 * Candidate properties for the cleaning type (vacuum only, mop only, both, vacuum then mop…), in order of preference.
 * `vacuum:mode` is only used when its values are cleaning types (e.g. `ijai.vacuum.v3`: Sweep / Sweep And Mop / Mop).
 */
const CLEANING_TYPE_CANDIDATES = ["sweep-mop-type", "mode"];
const CLEANING_TYPE = /sweep|mop/i;
const MIN_MODES = 3;

/**
 * Maps the (very heterogeneous) descriptions of `vacuum:status` to the states used by the other vacuum classes.
 * Keys are lowercased descriptions without spaces, dashes or underscores.
 */
const STATE_MAP: Record<string, string> = {
  idle: "idle",
  idleinoutside: "idle",
  none: "idle",
  sweeping: "cleaning",
  busy: "cleaning",
  cleaning: "cleaning",
  mopping: "cleaning",
  sweepingandmopping: "cleaning",
  areasweeping: "zone-cleaning",
  partialsweeping: "zone-cleaning",
  selectedsweeping: "room-cleaning",
  paused: "paused",
  pause: "paused",
  washbreak: "paused",
  mappingpause: "paused",
  findchargerpause: "paused",
  gobasepaused: "paused",
  gochargebreak: "paused",
  error: "error",
  gocharging: "returning",
  backcharging: "returning",
  gowash: "returning",
  gowashing: "returning",
  charging: "charging",
  breakcharging: "charging",
  charged: "fully-charged",
  fullcharge: "fully-charged",
  chargingcompleted: "fully-charged",
  chargingover: "fully-charged",
  sleep: "sleeping",
  sleeping: "sleeping",
  dormant: "sleeping",
  updating: "updating",
  upgrading: "updating",
  upgrade: "updating",
  remote: "remote-control",
  remotecontrol: "remote-control",
  rfctrl: "remote-control",
  shutdown: "shutting-down",
};

const CHARGING_STATES = new Set(["charging", "fully-charged"]);

/**
 * Normalizes a status description to a state name.
 *
 * @param description The description from the spec's value-list
 * @returns A known state (e.g. `cleaning`) or the kebab-cased description
 */
export function normalizeState(description: string): string {
  const key = description.toLowerCase().replace(/[\s_-]+/g, "");
  return (
    STATE_MAP[key] ??
    description
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

/**
 * The modes of a property, if it's usable as a mode selector.
 *
 * @param resolved The property
 * @returns The modes, or `undefined` if the property is not writable or has a placeholder list
 */
function modesOf(resolved?: ResolvedProperty): MiotMode[] | undefined {
  const list = resolved?.property["value-list"];
  if (
    !resolved ||
    !isWritable(resolved.property) ||
    !list ||
    list.length < MIN_MODES
  ) {
    return undefined;
  }
  return list.map(({ value, description }) => ({
    value,
    name: description.trim() || `${value}`,
  }));
}

/**
 *
 * @param list
 * @param value
 */
function describe(list: MiotValueListItem[] | undefined, value: unknown) {
  return list?.find((item) => item.value === value)?.description;
}

/**
 * A vacuum whose properties and actions are resolved from its MIoT spec, using only the standard
 * (`miot-spec-v2`) services: `vacuum`, `battery`, `identify`, `brush-cleaner`, `filter`, `mop`, `device-information`.
 */
export class MiotVacuum extends ATVacuum.with(
  MiioApi,
  BatteryLevel,
  AutonomousCharging,
  AutonomousCleaning,
  AdjustableFanSpeed,
  ChargingState,
) {
  static get type() {
    return "miio:vacuum";
  }

  public readonly specIndex: MiotSpecIndex;
  private readonly fanProperty?: ResolvedProperty;
  private readonly fanModes?: MiotMode[];
  private readonly waterProperty?: ResolvedProperty;
  private readonly waterModes?: MiotMode[];
  private readonly cleaningTypeProperty?: ResolvedProperty;
  private readonly cleaningTypeModes?: MiotMode[];

  constructor(handle: DeviceHandle, spec: MiotSpec) {
    super(handle);
    this.specIndex = new MiotSpecIndex(spec);

    const status = this.specIndex.property("vacuum", "status");
    this.defineMiotProperty("status", status, {
      name: "state",
      mapper: (value: number) => {
        const description = describe(status?.property["value-list"], value);
        return description ? normalizeState(description) : `unknown-${value}`;
      },
    });

    const fault = this.specIndex.property("vacuum", "fault");
    this.defineMiotProperty("fault", fault, {
      name: "error",
      mapper: (value: number) => {
        if (value === 0) return null;
        const description = describe(fault?.property["value-list"], value);
        return {
          code: value,
          message: description || `Unknown error ${value}`,
        };
      },
    });

    this.defineMiotProperty(
      "battery_level",
      this.specIndex.property("battery", "battery-level"),
      { name: "batteryLevel" },
    );

    const chargingState = this.specIndex.property("battery", "charging-state");
    this.defineMiotProperty("charging_state", chargingState, {
      name: "chargingState",
      mapper: (value: number) => {
        const description = describe(
          chargingState?.property["value-list"],
          value,
        );
        return description ? normalizeState(description) : `unknown-${value}`;
      },
    });

    for (const candidate of FAN_SPEED_CANDIDATES) {
      const resolved = this.specIndex.property("vacuum", candidate);
      const modes = modesOf(resolved);
      if (modes && !modes.some((mode) => NOT_A_FAN_SPEED.test(mode.name))) {
        this.fanProperty = resolved;
        this.fanModes = modes;
        this.defineMiotProperty("fan_speed", resolved, { name: "fanSpeed" });
        break;
      }
    }

    for (const candidate of WATER_LEVEL_CANDIDATES) {
      const resolved = this.specIndex.property("vacuum", candidate);
      const modes = modesOf(resolved);
      if (modes) {
        this.waterProperty = resolved;
        this.waterModes = modes;
        this.defineMiotProperty("water_level", resolved, {
          name: "waterBoxMode",
        });
        break;
      }
    }

    for (const candidate of CLEANING_TYPE_CANDIDATES) {
      const resolved = this.specIndex.property("vacuum", candidate);
      const modes = modesOf(resolved);
      if (
        // Never reuse the property used for the fan speed
        !(
          resolved?.siid === this.fanProperty?.siid &&
          resolved?.piid === this.fanProperty?.piid
        ) &&
        modes &&
        modes.every((mode) => CLEANING_TYPE.test(mode.name))
      ) {
        this.cleaningTypeProperty = resolved;
        this.cleaningTypeModes = modes;
        this.defineMiotProperty("cleaning_type", resolved, {
          name: "cleaningType",
        });
        break;
      }
    }

    this.defineMiotProperty(
      "cleaning_time",
      this.specIndex.property("vacuum", "cleaning-time"),
      { name: "cleanTime" },
    );
    this.defineMiotProperty(
      "cleaning_area",
      this.specIndex.property("vacuum", "cleaning-area"),
      { name: "cleanArea" },
    );

    // Consumables (life level in %). Main and side brushes are both `brush-cleaner` services:
    // use the descriptions when available, otherwise assume the first one is the main brush and the second one the side brush.
    const brushes = this.specIndex.services("brush-cleaner");
    const mainBrush =
      brushes.find((s) => /main/i.test(s.description)) ?? brushes[0];
    const sideBrush =
      brushes.find((s) => /side/i.test(s.description)) ??
      brushes.find((s) => s !== mainBrush);
    for (const [did, name, service] of [
      ["main_brush_life", "mainBrushLifeLevel", mainBrush],
      ["side_brush_life", "sideBrushLifeLevel", sideBrush],
    ] as const) {
      const property = service?.properties?.find((p) =>
        p.type.includes(":brush-life-level:"),
      );
      if (service && property) {
        this.defineMiotProperty(
          did,
          { siid: service.iid, piid: property.iid, service, property },
          { name },
        );
      }
    }
    this.defineMiotProperty(
      "filter_life",
      this.specIndex.property("filter", "filter-life-level"),
      { name: "filterLifeLevel" },
    );
    this.defineMiotProperty(
      "mop_life",
      this.specIndex.property("mop", "mop-life-level"),
      { name: "mopLifeLevel" },
    );
  }

  private defineMiotProperty(
    did: string,
    resolved: ResolvedProperty | undefined,
    def: { name: string; mapper?: (value: never) => unknown },
  ) {
    if (!resolved || !isReadable(resolved.property)) return;
    this.defineProperty(did, {
      ...def,
      siid: resolved.siid,
      piid: resolved.piid,
    } as never);
  }

  /** `this`, typed for the MIoT helpers (the abstract-things mixins are not typed) */
  private get caller(): MiotCaller {
    return this as unknown as MiotCaller;
  }

  private request(did: string): MiotPropertyRequest | undefined {
    const def = this._propertyDefinitions[did] as
      | { siid?: number; piid?: number }
      | undefined;
    return def?.siid !== undefined && def.piid !== undefined
      ? { did, siid: def.siid, piid: def.piid }
      : undefined;
  }

  private async runAction(
    did: string,
    action: ResolvedAction | undefined,
    refresh = true,
  ) {
    if (!action) {
      throw new Error(`"${did}" is not supported by ${this.miioModel}`);
    }
    await callAction(
      this.caller,
      { did, siid: action.siid, aiid: action.aiid },
      [],
      refresh ? { refresh: ["state"], refreshDelay: 1000 } : undefined,
    );
  }

  propertyUpdated<T>(key: string, value: T, oldValue?: T) {
    if (key === "state") {
      clearErrorOnRecovery(this, value);
      const state = value as unknown as string;
      this.updateCleaning(isCleaningState(state));
      if (state === "error") {
        this.updateError(this.property("error"));
      }
      if (!this.request("charging_state")) {
        this.updateCharging(CHARGING_STATES.has(state));
      }
    } else if (key === "chargingState") {
      this.updateCharging(CHARGING_STATES.has(value as unknown as string));
    } else if (key === "fanSpeed") {
      this.updateFanSpeed(value);
    }

    super.propertyUpdated(key, value, oldValue);
  }

  /** The fan speeds supported by the device (empty if the spec doesn't describe them) */
  async fanSpeeds(): Promise<MiotMode[]> {
    return this.fanModes ?? [];
  }

  /** The water levels supported by the device (empty if the spec doesn't describe them) */
  async waterBoxModes(): Promise<MiotMode[]> {
    return this.waterModes ?? [];
  }

  /**
   * The cleaning types supported by the device, e.g. `Sweep`, `Mop`, `Sweep Mop`, `Sweep Before Mopping`
   * (empty if the spec doesn't describe them).
   *
   * @returns The list of cleaning types
   */
  async cleaningTypes(): Promise<MiotMode[]> {
    return this.cleaningTypeModes ?? [];
  }

  /**
   * Set the cleaning type (vacuum only, mop only, both, vacuum then mop…).
   *
   * @param type One of the values of {@link cleaningTypes}
   */
  async setCleaningType(type: number) {
    if (!this.cleaningTypeProperty) {
      throw new Error(
        `Changing the cleaning type is not supported by ${this.miioModel}`,
      );
    }
    await setProperty(
      this.caller,
      {
        did: "cleaning_type",
        siid: this.cleaningTypeProperty.siid,
        piid: this.cleaningTypeProperty.piid,
      },
      type,
      { refresh: ["cleaningType"] },
    );
  }

  getDeviceInfo() {
    return this.call("miIO.info", []);
  }

  async getSerialNumber(): Promise<string> {
    const serial = this.specIndex.property(
      "device-information",
      "serial-number",
    );
    if (!serial) return "unknown";
    const [result] = await getProperties(this.caller, [
      { did: "serial_number", siid: serial.siid, piid: serial.piid },
    ]);
    return result?.code === 0 && result.value ? `${result.value}` : "unknown";
  }

  // Not available via the standard MIoT services (yet)
  async getRoomMap(): Promise<unknown[]> {
    return [];
  }

  async getTimer(): Promise<unknown[]> {
    return [];
  }

  async cleanRooms(_listOfRooms: unknown[]): Promise<void> {
    throw new Error(`Room cleaning is not supported by ${this.miioModel} yet`);
  }

  async resumeCleanRooms(listOfRooms: unknown[]): Promise<void> {
    return this.cleanRooms(listOfRooms);
  }

  /**
   * Start a cleaning session.
   */
  activateCleaning() {
    return this.runAction(
      "start_sweep",
      this.specIndex.action("vacuum", "start-sweep"),
    );
  }

  /**
   * Pause the current cleaning session (stops it if the device doesn't support pausing).
   */
  pause() {
    const pause =
      this.specIndex.action("vacuum", "pause-sweeping") ??
      this.specIndex.action("vacuum", "pause");
    return pause
      ? this.runAction("pause_sweeping", pause)
      : this.deactivateCleaning();
  }

  /**
   * Stop the current cleaning session.
   */
  deactivateCleaning() {
    return this.runAction(
      "stop_sweeping",
      this.specIndex.action("vacuum", "stop-sweeping"),
    );
  }

  /**
   * Return to the dock.
   */
  activateCharging() {
    return this.runAction(
      "start_charge",
      this.specIndex.action("battery", "start-charge") ??
        this.specIndex.action("vacuum", "start-charge"),
    );
  }

  /**
   * Make the device play a sound to locate it.
   */
  async find() {
    await this.runAction(
      "identify",
      this.specIndex.action("identify", "identify"),
      false,
    );
    return null;
  }

  /**
   * Set the fan speed.
   *
   * @param speed One of the values of {@link fanSpeeds}
   */
  async changeFanSpeed(speed: number) {
    if (!this.fanProperty) {
      throw new Error(
        `Changing the fan speed is not supported by ${this.miioModel}`,
      );
    }
    await setProperty(
      this.caller,
      {
        did: "fan_speed",
        siid: this.fanProperty.siid,
        piid: this.fanProperty.piid,
      },
      speed,
      { refresh: ["fanSpeed"] },
    );
  }

  async getWaterBoxMode() {
    return this.property("waterBoxMode");
  }

  /**
   * Set the water level.
   *
   * @param mode One of the values of {@link waterBoxModes}
   */
  async setWaterBoxMode(mode: number) {
    if (!this.waterProperty) {
      throw new Error(
        `Changing the water level is not supported by ${this.miioModel}`,
      );
    }
    await setProperty(
      this.caller,
      {
        did: "water_level",
        siid: this.waterProperty.siid,
        piid: this.waterProperty.piid,
      },
      mode,
      { refresh: ["waterBoxMode"] },
    );
  }

  async loadProperties(props: string[]) {
    const requests = props
      .map((key) => this._reversePropertyDefinitions[key] || key)
      .map((did) => this.request(did))
      .filter((r): r is MiotPropertyRequest => !!r);

    const results = await getProperties(this.caller, requests);
    const mapped = {};
    for (const result of results) {
      if (result.code === 0) {
        this._pushProperty(mapped, result.did, result.value);
      }
    }
    return mapped;
  }
}

/**
 * Whether a spec describes a vacuum that {@link MiotVacuum} can drive.
 *
 * @param spec The spec
 * @returns `true` if it has the standard `vacuum:status` property and `vacuum:start-sweep` action
 */
export function isSupportedMiotVacuum(spec: MiotSpec): boolean {
  const index = new MiotSpecIndex(spec);
  return (
    !!index.property("vacuum", "status") &&
    !!index.action("vacuum", "start-sweep")
  );
}

/** Specs this small (and without vendor services) are cloud/voice-assistant stubs of legacy miIO devices */
const PLACEHOLDER_SPEC_MAX_PROPERTIES = 10;

/**
 * Whether a spec is just a placeholder (e.g. legacy miIO devices like `roborock.vacuum.s5` or `viomi.vacuum.v7`
 * publish minimal specs with only status, mode and battery, which are not what the device speaks locally).
 *
 * @param spec The spec
 * @returns `true` if the spec has no vendor-specific services and very few properties
 */
export function isPlaceholderSpec(spec: MiotSpec): boolean {
  const hasVendorServices = spec.services.some(
    (service) => parseUrn(service.type).namespace !== STANDARD_NAMESPACE,
  );
  const properties = spec.services.reduce(
    (count, service) => count + (service.properties?.length ?? 0),
    0,
  );
  return !hasVendorServices && properties <= PLACEHOLDER_SPEC_MAX_PROPERTIES;
}
