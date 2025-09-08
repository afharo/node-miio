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
  get_timer: {
    params?: [];
    response: GetTimerResponseTimer[];
  };
  app_segment_clean: {
    params: number[];
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
  get_clean_record: {
    params: [number];
    // [start, end, duration, area, ??, complete]
    response: Array<[number, number, number, number, unknown, number]>;
  };
  get_status: {
    params: [];
    response: Record<string, unknown>;
  };
  get_consumable: {
    params: [];
    response: Record<string, unknown>;
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

  // Dreame
  action: {
    params: {
      did: string;
      siid: number;
      aiid: number;
      in: [];
    };
    response: unknown;
  };
  set_properties: {
    params: {
      did: string;
      siid: number;
      piid: number;
      value: unknown;
    }[];
    response: unknown;
  };
  get_properties: {
    params: {
      did: string;
      siid: number;
      piid: number;
    }[];
    response: { code: number; did: string; value: unknown }[];
  };
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
