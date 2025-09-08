/**
 * Mapping from models into high-level devices.
 */
import { AirMonitor } from "./devices/air-monitor";
import { AirPurifier } from "./devices/air-purifier";
import Gateway from "./devices/gateway";
import { Vacuum } from "./devices/vacuums/vacuum";
import { MijiaVacuum } from "./devices/vacuums/mijiavacuum";
import { ViomiVacuum } from "./devices/vacuums/viomivacuum";
import PowerPlug from "./devices/power-plug";
import PowerPlugChuangmiV1 from "./devices/chuangmi.plug.v1";
import PowerStrip from "./devices/power-strip";
import Humidifier from "./devices/humidifier";
import YeelightColor from "./devices/yeelight.color";
import YeelightMono from "./devices/yeelight.mono";
import EyecareLamp2 from "./devices/eyecare-lamp2";
import PhilipsLightBulb from "./devices/philips-light-bulb";

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

  "lumi.gateway.v2": Gateway.WithLightAndSensor,
  "lumi.gateway.v3": Gateway.WithLightAndSensor,
  "lumi.acpartner.v1": Gateway.Basic,
  "lumi.acpartner.v2": Gateway.Basic,
  "lumi.acpartner.v3": Gateway.Basic,

  "qmi.powerstrip.v1": PowerStrip,
  "zimi.powerstrip.v2": PowerStrip,

  "yeelink.light.lamp1": YeelightMono,
  "yeelink.light.mono1": YeelightMono,
  "yeelink.light.color1": YeelightColor,
  "yeelink.light.strip1": YeelightColor,

  "philips.light.sread1": EyecareLamp2,
  "philips.light.bulb": PhilipsLightBulb,
};
