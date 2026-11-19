/**
 * List of commands with their expected parameters
 */
export interface Protocol {
  "miIO.info": {
    params?: [];
    response: MiioDeviceInfo;
  };
  "miIO.wifi_assoc_state": {
    params?: [];
    response: unknown;
  };
  "miIO.config_router": {
    params: { ssid: string; passwd: string };
    response: unknown;
  };
  get_prop: {
    params: string[];
    response: unknown[];
  };
  get_serial_number: {
    params?: [];
    response: [{ serial_number: string }];
  };
  get_room_mapping: {
    params?: [];
    response: [string, string][];
  };
  // Roborock: the name of the current map file in the Xiaomi Cloud ("retry" while it's being uploaded)
  get_map_v1: {
    params?: [];
    response: [string];
  };
  get_timer: {
    params?: [];
    response: GetTimerResponseTimer[];
  };
  app_segment_clean: {
    // Legacy format: the list of segment ids. Newer firmwares also accept an object with the number of repeats.
    params: number[] | [{ segments: number[]; repeat: number }];
    response: unknown;
  };
  resume_segment_clean: {
    params: number[];
    response: unknown;
  };
  app_zoned_clean: {
    params: number[];
    response: unknown;
  };
  app_start: {
    params: [];
    response: unknown;
  };
  app_pause: {
    params: [];
    response: unknown;
  };
  app_stop: {
    params: [];
    response: unknown;
  };
  app_charge: {
    params: [];
    response: unknown;
  };
  app_spot: {
    params: [];
    response: unknown;
  };
  app_start_collect_dust: {
    params: [];
    response: unknown;
  };
  app_stop_collect_dust: {
    params: [];
    response: unknown;
  };
  set_custom_mode: {
    params: [number];
    response: unknown;
  };
  get_water_box_custom_mode: {
    params: [];
    response: [number] | { water_box_mode: number; distance_off: number };
  };
  set_water_box_custom_mode: {
    params: [number] | { water_box_mode: number; distance_off: number };
    response: unknown;
  };
  find_me: {
    params: [""];
    response: unknown;
  };
  app_goto_target: {
    params: [number, number];
    response: unknown;
  };
  get_clean_summary: {
    params: [];
    // [??, ??, count, days]
    response: [unknown, unknown, number, number[]];
  };
  // Roborock: Do Not Disturb
  get_dnd_timer: {
    params: [];
    response: [RoborockDndTimer];
  };
  set_dnd_timer: {
    // [start_hour, start_minute, end_hour, end_minute]
    params: [number, number, number, number];
    response: unknown;
  };
  close_dnd_timer: {
    params: [];
    response: unknown;
  };
  // Roborock: carpet mode (boost the suction on carpets)
  get_carpet_mode: {
    params: [];
    response: [RoborockCarpetMode];
  };
  set_carpet_mode: {
    params: [RoborockCarpetMode];
    response: unknown;
  };
  // Roborock: mop route (S7 and newer)
  get_mop_mode: {
    params: [];
    response: [number];
  };
  set_mop_mode: {
    params: [number];
    response: unknown;
  };
  // Roborock: multi-floor maps
  get_multi_maps_list: {
    params: [];
    response: [RoborockMultiMapsList];
  };
  load_multi_map: {
    params: [number];
    response: unknown;
  };
  // Roborock: dock (mop washing)
  app_start_wash: {
    params: [];
    response: unknown;
  };
  app_stop_wash: {
    params: [];
    response: unknown;
  };
  // Roborock: consumables and sound
  reset_consumable: {
    params: [string];
    response: unknown;
  };
  get_sound_volume: {
    params: [];
    response: [number];
  };
  change_sound_volume: {
    params: [number];
    response: unknown;
  };
  get_clean_record: {
    params: [number];
    // [start, end, duration, area, ??, complete]
    response: Array<[number, number, number, number, unknown, number]>;
  };
  get_status: {
    params: [];
    response: [Record<string, unknown>];
  };
  get_consumable: {
    params: [];
    response: [Record<string, unknown>];
  };

  // Viomi
  set_mode_withroom: {
    params: number[];
    response: unknown;
  };
  get_ordertime: {
    params?: [];
    response: GetTimerResponseTimer[]; // TODO: Confirm that this is the response
  };
  set_mode: {
    params: number[];
    response: unknown;
  };
  set_charge: {
    params: [number];
    response: unknown;
  };
  set_suction: {
    params: [number];
    response: unknown;
  };

  // MIoT (https://miot-spec.org)
  action: {
    params: {
      did: string;
      siid: number;
      aiid: number;
      in: unknown[];
    };
    response: MiotActionResult;
  };
  set_properties: {
    params: {
      did: string;
      siid: number;
      piid: number;
      value: unknown;
    }[];
    response: MiotPropertyResult[];
  };
  get_properties: {
    params: {
      did: string;
      siid: number;
      piid: number;
    }[];
    response: MiotPropertyResult[];
  };
}

/** `code` is `0` on success, a negative number otherwise (e.g. `-4001`: property not available) */
export interface MiotPropertyResult {
  did: string;
  siid?: number;
  piid?: number;
  code: number;
  value?: unknown;
}

export interface MiotActionResult {
  did?: string;
  siid?: number;
  aiid?: number;
  code: number;
  out?: unknown[];
}

export interface RoborockDndTimer {
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  enabled: number;
}

export interface RoborockCarpetMode {
  enable: number;
  current_high: number;
  current_integral: number;
  current_low: number;
  stall_time: number;
}

export interface RoborockMultiMapsList {
  max_multi_map: number;
  max_bak_map: number;
  multi_map_count: number;
  map_info: Array<{
    mapFlag: number;
    add_time: number;
    length: number;
    name: string;
  }>;
}

export interface MiioDeviceInfo {
  fw_ver: string;
  model: string;
}

export type GetTimerResponseTimer = [
  string, // timer ID
  "off" | "disable" | "on" | "enable", // status
  GetTimerResponseTimerDefinition, // timer definition
];

export type GetTimerResponseTimerDefinition = [
  string, // cron expression
  GetTimerResponseTimerDefinitionAction, // action
];

export type GetTimerResponseTimerDefinitionAction = [
  string, // method
  GetTimerResponseTimerDefinitionActionParams, // params
];

export type GetTimerResponseTimerDefinitionActionParams = {
  fan_power: number;
  segments: string; // comma-separated list of segments (e.g.: '28,19,18,17,16,20,29,23,26,25,24')
  repeat: number;
  clean_order_mode: number;
};
