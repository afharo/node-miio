/**
 * List of commands with their expected parameters
 */
export interface Protocol {
  "miIO.info": [];
  "miIO.wifi_assoc_state": [];
  "miIO.config_router": { ssid: string; passwd: string };
}
