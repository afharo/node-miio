/**
 * Mapping from models into high-level devices.
 */
import { AirMonitor } from "./devices/air-monitor.js";
import { AirPurifier } from "./devices/air-purifier.js";
import { GatewayBasic, GatewayWithLightAndSensor } from "./devices/gateway.js";
import { Vacuum } from "./devices/vacuums/vacuum.js";
import { MijiaVacuum } from "./devices/vacuums/mijiavacuum.js";
import { ViomiVacuum } from "./devices/vacuums/viomivacuum.js";
import { DreameVacuum } from "./devices/vacuums/dreamevacuum.js";
import { PowerPlug } from "./devices/power-plug.js";
import { PowerPlugChuangmiV1 } from "./devices/chuangmi.plug.v1.js";
import { PowerStrip } from "./devices/power-strip.js";
import { Humidifier } from "./devices/humidifier.js";
import { YeelightColor } from "./devices/yeelight.color.js";
import { YeelightMono } from "./devices/yeelight.mono.js";
import { EyecareLamp2 } from "./devices/eyecare-lamp2.js";
import { PhilipsLightBulb } from "./devices/philips-light-bulb.js";

export const models = {
  "zhimi.airmonitor.v1": AirMonitor,

  // Air Purifier 1 (and Pro?)
  "zhimi.airpurifier.v1": AirPurifier,
  "zhimi.airpurifier.v2": AirPurifier,
  "zhimi.airpurifier.v3": AirPurifier,
  "zhimi.airpurifier.v6": AirPurifier,

  // Air Purifier 2
  "zhimi.airpurifier.m1": AirPurifier,
  "zhimi.airpurifier.m2": AirPurifier,

  // Air Purifier 2S
  "zhimi.airpurifier.ma2": AirPurifier,

  "zhimi.humidifier.v1": Humidifier,

  "chuangmi.plug.m1": PowerPlug,
  "chuangmi.plug.v1": PowerPlugChuangmiV1,
  "chuangmi.plug.v2": PowerPlug,

  "rockrobo.vacuum.v1": Vacuum,
  "roborock.vacuum.s5": Vacuum,
  "roborock.vacuum.s5e": Vacuum,
  "roborock.vacuum.c1": Vacuum,
  "roborock.vacuum.s6": Vacuum,
  "roborock.vacuum.t6": Vacuum,
  "roborock.vacuum.e2": Vacuum,
  "roborock.vacuum.s4": Vacuum,
  "roborock.vacuum.a10": Vacuum,

  "roborock.vacuum.m1s": MijiaVacuum,

  "viomi.vacuum.v7": ViomiVacuum,
  "viomi.vacuum.v8": ViomiVacuum,

  // Hand-mapped MIoT vacuum (other `dreame.vacuum.*` models are resolved from their MIoT spec)
  "dreame.vacuum.mc1808": DreameVacuum,

  "lumi.gateway.v2": GatewayWithLightAndSensor,
  "lumi.gateway.v3": GatewayWithLightAndSensor,
  "lumi.acpartner.v1": GatewayBasic,
  "lumi.acpartner.v2": GatewayBasic,
  "lumi.acpartner.v3": GatewayBasic,

  "qmi.powerstrip.v1": PowerStrip,
  "zimi.powerstrip.v2": PowerStrip,

  "yeelink.light.lamp1": YeelightMono,
  "yeelink.light.mono1": YeelightMono,
  "yeelink.light.color1": YeelightColor,
  "yeelink.light.strip1": YeelightColor,

  "philips.light.sread1": EyecareLamp2,
  "philips.light.bulb": PhilipsLightBulb,
};
