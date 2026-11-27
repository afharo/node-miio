import { compose } from "../../things/compose";
import { SpotCleaning } from "../../things/capabilities/cleaning";
import { checkResult } from "../../check_result";
import type { DeviceHandle } from "../../management";
import type { Protocol } from "../../protocol";
import type { CloudServer, XiaomiCloud } from "../../cloud/client";
import { parseRoborockMap, type RoborockMap } from "../../maps/roborock_map";
import type { ActionDefinition } from "../../things/action_metadata";

import {
  resolveVacuumModes,
  type VacuumMode,
  type CleanPreset,
  type VacuumModes,
} from "./vacuum_modes";
import { clearErrorOnRecovery } from "./vacuum_errors";
import { VacuumThing } from "./vacuum_thing";
import { vacuumActions } from "./vacuum_actions";

/** Mop routes (`get_mop_mode`/`set_mop_mode`) of the S7 and newer */
export const MOP_ROUTES = {
  standard: 300,
  deep: 301,
  deepPlus: 303,
  // Saros 20 (a296): "Fast", and the route of its SmartPlan
  fast: 304,
  smartPlan: 306,
} as const;

/** Consumables that can be reset with {@link Vacuum.resetConsumable}, and the property they map to */
const CONSUMABLE_PROPERTIES = {
  main_brush_work_time: "mainBrushWorkTime",
  side_brush_work_time: "sideBrushWorkTime",
  filter_work_time: "filterWorkTime",
  sensor_dirty_time: "sensorDirtyTime",
} as const;

export type RoborockConsumable = keyof typeof CONSUMABLE_PROPERTIES;

/** Properties that are also exposed in `state()` and the `stateChanged` events */
const STATE_PROPERTIES = [
  "waterBoxAttached",
  "waterShortage",
  "mopDrying",
  // So the plugins follow the water level and mop route (e.g. a preset such as SmartPlan) when they change in the app
  "waterBoxMode",
  "mopRoute",
  "currentSegment",
];

/**
 * Maps a 0/1 flag to a boolean. Missing values stay `undefined`, so models that don't report them don't get the property.
 *
 * @param value The raw value
 * @returns The boolean value, or `undefined`
 */
/**
 * What `get_map_v1` answers while the map isn't ready: a status word (`retry`, `locating`…), never a map name, which
 * has the device ID and separators (`robomap%2F<did>%2F0`)
 */
const MAP_NOT_READY = /^[a-z_]+$/;

const isOne = (value: unknown) => (value == null ? undefined : value === 1);

/**
 * Implementation of the interface used by the Mi Robot Vacuum. This device
 * doesn't use properties via get_prop but instead has a get_status.
 */
export class Vacuum extends compose(VacuumThing, SpotCleaning) {
  static actions: ActionDefinition[] = vacuumActions(
    "getDeviceInfo",
    "getSerialNumber",
    "getRoomMap",
    "cleanRooms",
    "resumeCleanRooms",
    "cleanZones",
    "getTimer",
    "pause",
    "find",
    "fanSpeeds",
    "waterBoxModes",
    "getWaterBoxMode",
    "setWaterBoxMode",
    "startDustCollection",
    "stopDustCollection",
    "cleanPresets",
    "setCleanMotorMode",
    "getDoNotDisturb",
    "setDoNotDisturb",
    "disableDoNotDisturb",
    "getCarpetMode",
    "setCarpetMode",
    "getMopRoute",
    "setMopRoute",
    "getMaps",
    "loadMap",
    "getBackupMaps",
    "loadBackupMap",
    "getMapName",
    "startMopWash",
    "stopMopWash",
    "startMopDrying",
    "stopMopDrying",
    "resetConsumable",
    "getSoundVolume",
    "setSoundVolume",
    "sendToLocation",
    "getHistory",
    "getHistoryForDay",
  );

  static get type() {
    return "miio:vacuum";
  }

  constructor(handle: DeviceHandle) {
    super(handle);

    this.defineProperty("error_code", {
      name: "error",
      mapper: (e: number) => {
        let message;
        switch (e) {
          // https://github.com/marcelrv/XiaomiRobotVacuumProtocol/blob/master/status.md#error-codes
          case 0:
            return null;
          case 1:
            message = "Laser sensor fault";
            break;
          case 2:
            message = "Collision sensor fault";
            break;
          case 3:
            message = "Wheel floating";
            break;
          case 4:
            message = "Cliff sensor fault";
            break;
          case 5:
            message = "Main brush blocked";
            break;
          case 6:
            message = "Side brush blocked";
            break;
          case 7:
            message = "Wheel blocked";
            break;
          case 8:
            message = "Device stuck";
            break;
          case 9:
            message = "Dust bin missing";
            break;
          case 10:
            message = "Filter blocked";
            break;
          case 11:
            message = "Magnetic field detected";
            break;
          case 12:
            message = "Low battery";
            break;
          case 13:
            message = "Charging problem";
            break;
          case 14:
            message = "Battery failure";
            break;
          case 15:
            message = "Wall sensor fault";
            break;
          case 16:
            message = "Uneven surface";
            break;
          case 17:
            message = "Side brush failure";
            break;
          case 18:
            message = "Suction fan failure";
            break;
          case 19:
            message = "Unpowered charging station";
            break;
          // case 20:
          // 	message = 'Unknown Error 20';
          // 	break;
          case 21:
            message = "Laser pressure sensor problem";
            break;
          case 22:
            message = "Charge sensor problem";
            break;
          case 23:
            message = "Dock problem";
            break;
          case 24:
            message = "No-go zone or invisible wall detected";
            break;
          case 254:
            message = "Bin full";
            break;
          case 255:
            message = "Internal error";
            break;
          // case -1:
          // 	message = 'Unknown Error -1';
          // 	break;
          default:
            message = "Unknown error " + e;
        }
        return {
          code: e,
          message,
        };
      },
    });

    this.defineProperty("state", (s) => {
      // https://github.com/marcelrv/XiaomiRobotVacuumProtocol/blob/master/status.md#status-codes
      switch (s) {
        case 1:
          return "initiating";
        case 2:
          return "sleeping";
        case 3:
          return "idle";
        case 4:
          return "remote-control";
        case 5:
          return "cleaning";
        case 6:
          return "returning";
        case 7:
          return "manual-mode";
        case 8:
          return "charging";
        case 9:
          return "charging-error";
        case 10:
          return "paused";
        case 11:
          return "spot-cleaning";
        case 12:
          return "error";
        case 13:
          return "shutting-down";
        case 14:
          return "updating";
        case 15:
          return "docking";
        case 16:
          return "going-to-location";
        case 17:
          return "zone-cleaning";
        case 18:
          return "room-cleaning";
        case 22:
          return "dust-collection";
        // Docks that wash the mop (e.g. S7 MaxV Ultra, Saros 20): codes from the Roborock app
        case 23:
        case 25:
          return "washing-mop";
        case 26:
          return "returning-to-wash-mop";
        case 100:
          return "fully-charged";
      }
      return "unknown-" + s;
    });

    // Define the batteryLevel property for monitoring battery
    this.defineProperty("battery", {
      name: "batteryLevel",
    });

    this.defineProperty("clean_time", {
      name: "cleanTime",
    });
    this.defineProperty("clean_area", {
      name: "cleanArea",
      mapper: (v: number) => v / 1000000,
    });
    this.defineProperty("fan_power", {
      name: "fanSpeed",
    });
    this.defineProperty("in_cleaning", {
      name: "cleaningMode",
      mapper: (v) => {
        switch (v) {
          case 0:
            return "idle";
          case 1:
            return "cleaning";
          case 2:
            return "zone-cleaning";
          case 3:
            return "room-cleaning";
        }
        return "unknown-" + v;
      },
    });

    this.defineProperty("in_returning");
    // The room (map segment) the robot is cleaning: `cleaning_info.segment_id` of newer robots (-1: none)
    this.defineProperty("cleaning_info", {
      name: "currentSegment",
      mapper: (info: { segment_id?: unknown } | undefined) =>
        typeof info?.segment_id === "number" && info.segment_id >= 0
          ? info.segment_id
          : undefined,
    });

    // Consumable status - times for brushes and filters
    this.defineProperty("main_brush_work_time", {
      name: "mainBrushWorkTime",
    });
    this.defineProperty("side_brush_work_time", {
      name: "sideBrushWorkTime",
    });
    this.defineProperty("filter_work_time", {
      name: "filterWorkTime",
    });
    this.defineProperty("sensor_dirty_time", {
      name: "sensorDirtyTime",
    });

    // The mop route (S7 and newer), see MOP_ROUTES
    this.defineProperty("mop_mode", {
      name: "mopRoute",
    });
    this.defineProperty("water_box_mode", {
      name: "waterBoxMode",
    });

    this.defineProperty("auto_dust_collection", {
      name: "autoDustCollection",
    });
    this.defineProperty("dust_collection_status", {
      name: "dustCollectionStatus",
    });

    // Water tank and dock status. Only reported by the models that have them (otherwise they're not stored).
    this.defineProperty("water_box_status", {
      name: "waterBoxAttached",
      mapper: isOne,
    });
    this.defineProperty("water_shortage_status", {
      name: "waterShortage",
      mapper: isOne,
    });
    this.defineProperty("dry_status", {
      name: "mopDrying",
      mapper: isOne,
    });
  }

  propertyUpdated<T>(key: string, value: T, oldValue?: T) {
    if (key === "state") {
      clearErrorOnRecovery(this, value);
      // Update charging state
      this.updateCharging(value === "charging");
      // Exposed in `state()` and the `stateChanged` events
      this.updateState("state", value);

      switch (value) {
        case "cleaning":
        case "spot-cleaning":
        case "zone-cleaning":
        case "room-cleaning":
          // The vacuum is cleaning
          this.updateCleaning(true);
          break;
        case "paused":
          // Cleaning has been paused, do nothing special
          break;
        case "error":
          // An error has occurred, rely on error mapping
          this.updateError(this.property("error"));
          break;
        case "charging-error":
          // Charging error, trigger an error
          this.updateError({
            code: "charging-error",
            message: "Error during charging",
          });
          break;
        default:
          // The vacuum is not cleaning
          this.updateCleaning(false);
          break;
      }
    } else if (key === "fanSpeed") {
      this.updateFanSpeed(value as number);
    } else if (STATE_PROPERTIES.includes(key)) {
      // Exposed in `state()` and the `stateChanged` events
      this.updateState(key, value);
    }

    super.propertyUpdated(key, value, oldValue);
  }

  getDeviceInfo() {
    return this.call("miIO.info", []);
  }

  async getSerialNumber() {
    const serial = await this.call("get_serial_number", []);
    return serial[0].serial_number;
  }

  getRoomMap() {
    return this.call("get_room_mapping", []);
  }

  /**
   * Clean the given rooms (segment ids from {@link getRoomMap}).
   *
   * @param listOfRooms The segment ids
   * @param options Options
   * @param options.repeat How many times to clean each room (1-3). When > 1, the newer object format is sent,
   * which older firmwares may not support.
   */
  cleanRooms(listOfRooms: number[], options: { repeat?: number } = {}) {
    const params: Protocol["app_segment_clean"]["params"] =
      options.repeat && options.repeat > 1
        ? [{ segments: listOfRooms, repeat: options.repeat }]
        : listOfRooms;
    return this.call("app_segment_clean", params, {
      refresh: ["state"],
      refreshDelay: 1000,
    }).then(checkResult);
  }

  resumeCleanRooms(listOfRooms) {
    return this.call("resume_segment_clean", listOfRooms, {
      refresh: ["state"],
      refreshDelay: 1000,
    }).then(checkResult);
  }

  cleanZones(listOfZones) {
    return this.call("app_zoned_clean", listOfZones, {
      refresh: ["state"],
      refreshDelay: 1000,
    }).then(checkResult);
  }

  getTimer() {
    return this.call("get_timer", []);
  }

  /**
   * Start a cleaning session.
   */
  activateCleaning() {
    return this.call("app_start", [], {
      refresh: ["state"],
      refreshDelay: 1000,
    }).then(checkResult);
  }

  /**
   * Pause the current cleaning session.
   */
  pause() {
    return this.call("app_pause", [], {
      refresh: ["state"],
      refreshDelay: 1000, // https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/236
    }).then(checkResult);
  }

  /**
   * Stop the current cleaning session.
   */
  deactivateCleaning() {
    return this.call("app_stop", [], {
      refresh: ["state"],
      refreshDelay: 1000,
    }).then(checkResult);
  }

  /**
   * Stop the current cleaning session and return to charge.
   */
  activateCharging() {
    return (
      this.pause()
        .catch(() => this.deactivateCleaning())
        // Wait 1 second
        .then(() => new Promise((resolve) => setTimeout(resolve, 1000)))
        .then(() =>
          this.call("app_charge", [], {
            refresh: ["state"],
            refreshDelay: 1000,
          }),
        )
        .then(checkResult)
    );
  }

  /**
   * Start cleaning the current spot.
   */
  activateSpotClean() {
    return this.call("app_spot", [], {
      refresh: ["state"],
    }).then(checkResult);
  }

  /**
   * Start dustCollection.
   */
  startDustCollection() {
    return this.call("app_start_collect_dust", [], {
      refresh: ["state"],
      refreshDelay: 1000,
    }).then(checkResult);
  }

  /**
   * Stop dustCollection.
   */
  stopDustCollection() {
    return this.call("app_stop_collect_dust", [], {
      refresh: ["state"],
      refreshDelay: 1000,
    }).then(checkResult);
  }

  /**
   * Set the power of the fan (see {@link fanSpeeds}).
   *
   * While a preset is on (e.g. SmartPlan), the robot refuses to change only the fan speed: the preset is left with
   * {@link setCleanMotorMode} (a middle water level and the standard mop route).
   *
   * @param speed The fan speed
   */
  async changeFanSpeed(speed: number) {
    if (await this.activePreset()) {
      const water = middle(
        (await this.waterBoxModes()).filter(({ value }) => value !== 200),
        /^(medium|moderate|level 15)$/i,
      );
      return this.setCleanMotorMode({
        fanSpeed: speed,
        waterBoxMode: water?.value ?? 200,
        mopRoute: MOP_ROUTES.standard,
      });
    }
    return this.call("set_custom_mode", [speed], {
      refresh: ["fanSpeed"],
    }).then(checkResult);
  }

  /**
   * @returns The preset the robot is on (matched by its fan speed or mop route), if any
   */
  private async activePreset(): Promise<CleanPreset | undefined> {
    const presets = await this.cleanPresets().catch(() => []);
    const fan = this.property<number>("fanSpeed");
    const route = this.property<number>("mopRoute");
    return presets.find(
      ({ fanSpeed, mopRoute }) => fanSpeed === fan || mopRoute === route,
    );
  }

  /**
   * The current water level (see {@link waterBoxModes}).
   *
   * @returns The current water box mode (`undefined` if the robot doesn't report it)
   */
  async getWaterBoxMode(): Promise<number | undefined> {
    // From https://github.com/marcelrv/XiaomiRobotVacuumProtocol/blob/master/water_box_custom_mode.md
    const response = await this.call("get_water_box_custom_mode", [], {
      refresh: ["waterBoxMode"],
    });
    // Older firmwares respond `[203]`, newer ones `{ water_box_mode: 235, distance_off: 0 }`
    const value = Array.isArray(response)
      ? response[0]
      : response?.water_box_mode;
    return typeof value === "number" ? value : undefined;
  }

  /**
   * Set the water level (see {@link waterBoxModes}).
   *
   * While a preset is on (e.g. SmartPlan), the preset is left with {@link setCleanMotorMode} (a middle fan speed and
   * the standard mop route), like {@link changeFanSpeed}.
   *
   * @param mode The water level
   */
  async setWaterBoxMode(mode: number) {
    if (await this.activePreset()) {
      const fan = middle(
        (await this.fanSpeeds()).filter(
          ({ name }) => !/^(mop|off)$/i.test(name),
        ),
        /^(balanced|standard)$/i,
      );
      return this.setCleanMotorMode({
        fanSpeed: fan?.value ?? 102,
        waterBoxMode: mode,
        mopRoute: MOP_ROUTES.standard,
      });
    }
    // From https://github.com/marcelrv/XiaomiRobotVacuumProtocol/blob/master/water_box_custom_mode.md
    return this.call("set_water_box_custom_mode", [mode], {
      refresh: ["waterBoxMode"],
    }).then(checkResult);
  }

  /**
   * Activate the find function, will make the device give off a sound.
   */
  find() {
    return this.call("find_me", [""]).then(() => null);
  }

  /**
   * The fan speeds supported by this model (and firmware), to be used with {@link changeFanSpeed}.
   *
   * @returns The list of modes
   */
  async fanSpeeds(): Promise<VacuumMode[]> {
    return (await this.modes()).fanSpeeds;
  }

  /**
   * The water levels supported by this model, to be used with {@link setWaterBoxMode}. Empty if not supported.
   *
   * @returns The list of modes
   */
  async waterBoxModes(): Promise<VacuumMode[]> {
    return (await this.modes()).waterBoxModes;
  }

  private modesPromise?: Promise<VacuumModes>;

  private modes(): Promise<VacuumModes> {
    // The firmware version is needed because some models changed their fan speeds in newer firmwares
    const modes =
      this.modesPromise ??
      this.call("miIO.info", [])
        .then((info) => info?.fw_ver)
        .catch(() => undefined)
        .then((firmware) => resolveVacuumModes(this.miioModel ?? "", firmware));
    this.modesPromise = modes;
    return modes;
  }

  /**
   * Get the Do Not Disturb schedule.
   *
   * @returns Whether it's enabled, and the start and end times (`HH:mm`)
   */
  async getDoNotDisturb(): Promise<{
    enabled: boolean;
    start: string;
    end: string;
  }> {
    const [dnd] = await this.call("get_dnd_timer", []);
    const time = (h: number, min: number) =>
      `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    return {
      enabled: dnd.enabled === 1,
      start: time(dnd.start_hour, dnd.start_minute),
      end: time(dnd.end_hour, dnd.end_minute),
    };
  }

  /**
   * Enable the Do Not Disturb schedule.
   *
   * @param start Start time (`HH:mm`)
   * @param end End time (`HH:mm`)
   */
  async setDoNotDisturb(start: string, end: string) {
    const parse = (time: string) => {
      const match = time.match(/^(\d{1,2}):(\d{2})$/);
      const [h, min] = match
        ? [Number(match[1]), Number(match[2])]
        : [NaN, NaN];
      if (!(h >= 0 && h < 24 && min >= 0 && min < 60)) {
        throw new Error(`Invalid time "${time}", expected HH:mm`);
      }
      return [h, min] as const;
    };
    const [startHour, startMinute] = parse(start);
    const [endHour, endMinute] = parse(end);
    await this.call("set_dnd_timer", [
      startHour,
      startMinute,
      endHour,
      endMinute,
    ]).then(checkResult);
  }

  /**
   * Disable the Do Not Disturb schedule.
   */
  async disableDoNotDisturb() {
    await this.call("close_dnd_timer", []).then(checkResult);
  }

  /**
   * Whether the carpet mode (suction boost on carpets) is enabled.
   *
   * @returns `true` if enabled
   */
  async getCarpetMode(): Promise<boolean> {
    const [mode] = await this.call("get_carpet_mode", []);
    return mode.enable === 1;
  }

  /**
   * Enable or disable the carpet mode (keeps the current sensitivity settings).
   *
   * @param enabled Whether to enable it
   */
  async setCarpetMode(enabled: boolean) {
    const [current] = await this.call("get_carpet_mode", []);
    await this.call("set_carpet_mode", [
      { ...current, enable: enabled ? 1 : 0 },
    ]).then(checkResult);
  }

  /**
   * The mop route (S7 and newer).
   *
   * @returns The raw value (see {@link MOP_ROUTES})
   */
  async getMopRoute(): Promise<number> {
    const [mode] = await this.call("get_mop_mode", []);
    return mode;
  }

  /**
   * Set the mop route (S7 and newer).
   *
   * @param route One of the values of {@link MOP_ROUTES}
   */
  async setMopRoute(route: number) {
    await this.call("set_mop_mode", [route]).then(checkResult);
  }

  /**
   * The presets of this model (fan speed, water level and mop route together, e.g. "SmartPlan"), to be used with
   * {@link setCleanMotorMode}. Empty if there are none.
   *
   * @returns The presets
   */
  async cleanPresets(): Promise<CleanPreset[]> {
    return (await this.modes()).presets;
  }

  /**
   * Set the fan speed, water level and mop route at once (newer Roborock robots), e.g. a preset of
   * {@link cleanPresets}.
   *
   * @param settings The settings
   * @param settings.fanSpeed The fan speed (see {@link fanSpeeds})
   * @param settings.waterBoxMode The water level (see {@link waterBoxModes})
   * @param settings.mopRoute The mop route (see {@link MOP_ROUTES})
   */
  async setCleanMotorMode(settings: {
    fanSpeed: number;
    waterBoxMode: number;
    mopRoute: number;
  }) {
    await this.call(
      "set_clean_motor_mode",
      [
        {
          fan_power: settings.fanSpeed,
          water_box_mode: settings.waterBoxMode,
          mop_mode: settings.mopRoute,
        },
      ],
      { refresh: ["fanSpeed", "waterBoxMode", "mopRoute"], refreshDelay: 1000 },
    ).then(checkResult);
  }

  /**
   * The saved maps (multi-floor).
   *
   * @returns The id and name of each map
   */
  async getMaps(): Promise<Array<{ id: number; name: string }>> {
    const response = await this.call("get_multi_maps_list", []);
    // Models without multi-floor maps (e.g. S5) answer "unknown_method"
    const [list] = Array.isArray(response) ? response : [];
    return (list?.map_info ?? []).map(({ mapFlag, name }) => ({
      id: mapFlag,
      name,
    }));
  }

  /**
   * The map backups ("Map saving" in the app, on models without multi-floor maps, e.g. S5): the robot keeps the last
   * few maps, and {@link loadBackupMap} restores one of them. A slot holds a different map once a newer one is saved:
   * identify a backup by when it was saved.
   *
   * @returns The slot and the time each backup was saved, newest first (none on models without backups)
   */
  async getBackupMaps(): Promise<Array<{ id: number; savedAt: Date }>> {
    const response = await this.call("get_recover_maps", []);
    if (!Array.isArray(response)) return [];
    return response
      .filter(
        (entry): entry is [number, number] =>
          Array.isArray(entry) &&
          Number.isFinite(entry[0]) &&
          Number.isFinite(entry[1]),
      )
      .map(([id, savedAt]) => ({ id, savedAt: new Date(savedAt * 1000) }))
      .sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
  }

  /**
   * The name of the current map file in the Xiaomi Cloud (e.g. `robomap%2F<did>%2F0`). While the map isn't ready, the
   * robot answers a status word instead (`retry` while it's uploading it, `locating` while it finds where it is at
   * the start of a cleaning…), so it's asked again a few times (with an increasing delay).
   *
   * @param options The options
   * @param options.retries How many times to ask (default 5)
   * @param options.delayMs The first delay between retries, doubled every time (default 100ms, up to 15s)
   * @returns The map name, to use with {@link XiaomiCloud.getMapFileUrl}
   */
  async getMapName(
    options: { retries?: number; delayMs?: number } = {},
  ): Promise<string> {
    const retries = options.retries ?? 5;
    let delay = options.delayMs ?? 100;
    for (let attempt = 1; ; attempt++) {
      const [name] = await this.call("get_map_v1", []);
      if (name && !MAP_NOT_READY.test(name)) return name;
      if (attempt >= retries) {
        throw new Error("The vacuum didn't return the map name");
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 15_000);
    }
  }

  /**
   * Downloads and parses the current map from the Xiaomi Cloud: rooms, robot position, current room…
   *
   * @param cloud A logged-in Xiaomi Cloud client
   * @param server The server the device is registered in (see {@link XiaomiCloud.findDevice})
   * @returns The map
   */
  async getCloudMap(
    cloud: Pick<XiaomiCloud, "getMapFileUrl" | "download">,
    server: CloudServer | string,
  ): Promise<RoborockMap> {
    const name = await this.getMapName();
    const url = await cloud.getMapFileUrl(server, name);
    return parseRoborockMap(await cloud.download(url));
  }

  /**
   * Switch to another saved map (multi-floor).
   *
   * @param id The id from {@link getMaps}
   */
  async loadMap(id: number) {
    await this.call("load_multi_map", [id]).then(checkResult);
  }

  /**
   * Restores a map backup: it replaces the current map.
   *
   * @param id The slot, from {@link getBackupMaps}
   */
  async loadBackupMap(id: number) {
    await this.call("recover_map", [id]).then(checkResult);
  }

  /**
   * Wash the mop in the dock (docks with mop washing only).
   */
  async startMopWash() {
    await this.call("app_start_wash", []).then(checkResult);
  }

  /**
   * Stop washing the mop.
   */
  async stopMopWash() {
    await this.call("app_stop_wash", []).then(checkResult);
  }

  /**
   * Dry the mop in the dock (docks with a mop dryer only).
   */
  async startMopDrying() {
    await this.call(
      "app_set_dryer_status",
      { status: 1 },
      {
        refresh: ["mopDrying"],
        refreshDelay: 1000,
      },
    ).then(checkResult);
  }

  /**
   * Stop drying the mop.
   */
  async stopMopDrying() {
    await this.call(
      "app_set_dryer_status",
      { status: 0 },
      {
        refresh: ["mopDrying"],
        refreshDelay: 1000,
      },
    ).then(checkResult);
  }

  /**
   * Reset a consumable after replacing it.
   *
   * @param consumable The consumable to reset
   */
  async resetConsumable(consumable: RoborockConsumable) {
    await this.call("reset_consumable", [consumable], {
      refresh: [CONSUMABLE_PROPERTIES[consumable]],
    }).then(checkResult);
  }

  /**
   * The volume of the voice.
   *
   * @returns 0-100
   */
  async getSoundVolume(): Promise<number> {
    const [volume] = await this.call("get_sound_volume", []);
    return volume;
  }

  /**
   * Change the volume of the voice.
   *
   * @param volume 0-100
   */
  async setSoundVolume(volume: number) {
    if (!(volume >= 0 && volume <= 100)) {
      throw new Error(`Invalid volume ${volume}, expected 0-100`);
    }
    await this.call("change_sound_volume", [Math.round(volume)]).then(
      checkResult,
    );
  }

  /**
   * Send the vacuum to a specific location.
   *
   * @param x
   * @param y
   */
  sendToLocation(x, y) {
    return this.call("app_goto_target", [x, y], {
      refresh: ["state"],
      refreshDelay: 1000,
    }).then(checkResult);
  }

  /**
   * Get information about the cleaning history of the device. Contains
   * information about the number of times it has been started and
   * the days it has been run.
   */
  getHistory() {
    return this.call("get_clean_summary", []).then((result) => {
      return {
        count: result[2],
        days: result[3].map((ts) => new Date(ts * 1000)),
      };
    });
  }

  /**
   * Get history for the specified day. The day should be fetched from
   * `getHistory`.
   *
   * @param day
   */
  getHistoryForDay(day) {
    let record = day;
    if (record instanceof Date) {
      record = Math.floor(record.getTime() / 1000);
    }
    return this.call("get_clean_record", [record]).then((result) => ({
      day: day,
      history: result.map((data) => ({
        // Start and end times
        start: new Date(data[0] * 1000),
        end: new Date(data[1] * 1000),

        // How long it took in seconds
        duration: data[2],

        // Area in m2
        area: data[3] / 1000000,

        // If it was a complete run
        complete: data[5] === 1,
      })),
    }));
  }

  async loadProperties(props) {
    // We override loadProperties to use get_status and get_consumables
    props = props.map((key) => this._reversePropertyDefinitions[key] || key);

    const [statusResponse, consumablesResponse] = await Promise.all([
      this.call("get_status", []),
      this.call("get_consumable", []),
    ]);
    // Both methods respond with a single-item array: `[{ ...values }]`
    const status = unwrapSingleItemArray(statusResponse);
    const consumables = unwrapSingleItemArray(consumablesResponse);

    const mapped = {};
    props.forEach((prop) => {
      let value = status[prop];
      if (typeof value === "undefined") {
        value = consumables[prop];
      }
      this._pushProperty(mapped, prop, value);
    });
    return mapped;
  }
}

/**
 * Some methods respond with an array containing a single object. This helper unwraps it (and also accepts the object
 * itself, in case some firmware responds without the wrapping array).
 *
 * @param response The response from the device
 * @returns The inner object (or an empty object if the response is not valid)
 */
function unwrapSingleItemArray(response: unknown): Record<string, unknown> {
  const value = Array.isArray(response) ? response[0] : response;
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * @param modes The modes
 * @param preferred The name of the mode to pick, if there's one
 * @returns The mode with the preferred name, else the one in the middle
 */
function middle(modes: VacuumMode[], preferred: RegExp) {
  return (
    modes.find(({ name }) => preferred.test(name)) ??
    modes[Math.floor((modes.length - 1) / 2)]
  );
}
