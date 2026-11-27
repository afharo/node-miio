import type { ActionDefinition } from "../../things/action_metadata";

/**
 * The actions of the vacuum classes. Each class declares the ones it supports with {@link vacuumActions}, so the same
 * action is described the same way everywhere.
 */
const VACUUM_ACTIONS = {
  getDeviceInfo: {
    description: "The device information (miIO.info)",
    returns: "object",
  },
  getSerialNumber: { description: "The serial number", returns: "string" },
  getRoomMap: {
    description: "The rooms (segment ids and names)",
    returns: "array",
  },
  cleanRooms: {
    description: "Cleans the given rooms (segment ids from getRoomMap)",
    arguments: [
      { type: "number[]", description: "The segment ids" },
      {
        type: "object",
        optional: true,
        description: "Options: { repeat } (how many times)",
      },
    ],
  },
  resumeCleanRooms: {
    description: "Resumes cleaning the given rooms",
    arguments: [{ type: "number[]", description: "The segment ids" }],
  },
  cleanZones: {
    description: "Cleans the given zones",
    arguments: [
      {
        type: "array",
        description: "The zones: [x1, y1, x2, y2, repeats] each",
      },
    ],
  },
  getTimer: { description: "The scheduled cleanings", returns: "array" },
  pause: { description: "Pauses the current cleaning" },
  find: { description: "Plays a sound to locate it" },
  fanSpeeds: {
    description: "The fan speeds it supports ({ value, name })",
    returns: "array",
  },
  waterBoxModes: {
    description: "The water levels it supports ({ value, name })",
    returns: "array",
  },
  getWaterBoxMode: { description: "The water level", returns: "number" },
  setWaterBoxMode: {
    description: "Changes the water level (a value of waterBoxModes)",
    arguments: [{ type: "number", description: "The water level" }],
  },
  startDustCollection: { description: "Empties the dustbin into the dock" },
  stopDustCollection: { description: "Stops emptying the dustbin" },
  cleanPresets: {
    description:
      "The presets it supports (fan speed, water level and mop route together)",
    returns: "array",
  },
  setCleanMotorMode: {
    description: "Changes the fan speed, water level and mop route at once",
    arguments: [
      {
        type: "object",
        description: "{ fanSpeed, waterBoxMode, mopRoute }",
      },
    ],
  },
  getDoNotDisturb: {
    description: "The Do Not Disturb schedule",
    returns: "object",
  },
  setDoNotDisturb: {
    description: "Enables the Do Not Disturb schedule",
    arguments: [
      { type: "string", description: "Start time (HH:mm)" },
      { type: "string", description: "End time (HH:mm)" },
    ],
  },
  disableDoNotDisturb: { description: "Disables the Do Not Disturb schedule" },
  getCarpetMode: {
    description: "Whether it boosts the suction on carpets",
    returns: "boolean",
  },
  setCarpetMode: {
    description: "Enables or disables the suction boost on carpets",
    arguments: [{ type: "boolean", description: "Whether to enable it" }],
  },
  getMopRoute: {
    description: "The mop route (S7 and newer)",
    returns: "number",
  },
  setMopRoute: {
    description: "Changes the mop route (S7 and newer)",
    arguments: [{ type: "number", description: "The mop route" }],
  },
  getMaps: { description: "The saved maps (multi-floor)", returns: "array" },
  loadMap: {
    description: "Switches to another saved map",
    arguments: [{ type: "number", description: "The id, from getMaps" }],
  },
  getBackupMaps: {
    description: "The map backups (e.g. S5), newest first",
    returns: "array",
  },
  loadBackupMap: {
    description: "Restores a map backup (it replaces the current map)",
    arguments: [
      { type: "number", description: "The slot, from getBackupMaps" },
    ],
  },
  getMapName: {
    description: "The name of the current map file in the Xiaomi Cloud",
    arguments: [
      {
        type: "object",
        optional: true,
        description: "Options: { retries, delayMs }",
      },
    ],
    returns: "string",
  },
  startMopWash: { description: "Washes the mop in the dock" },
  stopMopWash: { description: "Stops washing the mop" },
  startMopDrying: { description: "Dries the mop in the dock" },
  stopMopDrying: { description: "Stops drying the mop" },
  resetConsumable: {
    description: "Resets a consumable after replacing it",
    arguments: [
      {
        type: "string",
        description:
          "main_brush_work_time, side_brush_work_time, filter_work_time or sensor_dirty_time",
      },
    ],
  },
  getSoundVolume: { description: "The volume of the voice", returns: "number" },
  setSoundVolume: {
    description: "Changes the volume of the voice",
    arguments: [{ type: "percentage", description: "The volume" }],
  },
  sendToLocation: {
    description: "Sends it to a location of the map",
    arguments: [
      { type: "number", description: "x" },
      { type: "number", description: "y" },
    ],
  },
  getHistory: { description: "The cleaning history", returns: "object" },
  getHistoryForDay: {
    description: "The cleanings of a day (a record of getHistory)",
    arguments: [{ type: "number", description: "The day, from getHistory" }],
    returns: "array",
  },
  cleaningTypes: {
    description: "The cleaning types it supports, e.g. Sweep, Mop, Sweep Mop",
    returns: "array",
  },
  setCleaningType: {
    description: "Changes the cleaning type (a value of cleaningTypes)",
    arguments: [{ type: "number", description: "The cleaning type" }],
  },
  describeStatus: {
    description: "The spec's description of a vacuum:status value",
    arguments: [{ type: "number", description: "The status value" }],
    returns: "string",
  },
} satisfies Record<string, Omit<ActionDefinition, "name">>;

export type VacuumAction = keyof typeof VACUUM_ACTIONS;

/**
 * @param names The vacuum actions a class supports
 * @returns Their definitions, for the class' `static actions`
 */
export function vacuumActions(...names: VacuumAction[]): ActionDefinition[] {
  return names.map((name) => ({ name, ...VACUUM_ACTIONS[name] }));
}
