import { Cube, Switch, Switch1, Switch2, SwitchV2 } from "./controllers.js";
import { CtrlLN1 } from "./ctrl_ln1.js";
import { CtrlLN2 } from "./ctrl_ln2.js";
import { CtrlNeutral1 } from "./ctrl_neutral1.js";
import { CtrlNeutral2 } from "./ctrl_neutral2.js";
import { Plug } from "./plug.js";
import {
  Magnet,
  MagnetAq2,
  MotionSensor,
  MotionSensorAq2,
  SensorHT,
  WeatherSensor,
} from "./sensors.js";
import type { SubDevice, SubDeviceInfo, SubDeviceParent } from "./subdevice.js";

export type SubDeviceClass = new (
  parent: SubDeviceParent,
  info: SubDeviceInfo,
) => SubDevice;

/** The sub-device classes, by the type id the gateway reports */
export const subDeviceTypes: Record<string, SubDeviceClass> = {
  // Switch (button) controller
  1: Switch,
  // Motion sensor
  2: MotionSensor,
  // Magnet sensor for doors and windows
  3: Magnet,

  // TODO: What is 4, 5 and 6? plug, 86sw1 and 86sw2 are left

  // Light switch with two channels
  7: CtrlNeutral2,
  // Cube controller
  8: Cube,
  // Light switch with one channel
  9: CtrlNeutral1,
  // Temperature and Humidity sensor
  10: SensorHT,
  // Plug
  11: Plug,

  // Aqara Temperature/Humidity/Pressure sensor
  19: WeatherSensor,
  // Light switch (live+neutral wire version) with one channel
  20: CtrlLN1,
  // Light switch (live+neutral wire version) with two channels
  21: CtrlLN2,

  // AQ2 switch (square version)
  51: SwitchV2,
  // AQ2 motion sensor
  52: MotionSensorAq2,
  // AQ2 manget sensor
  53: MagnetAq2,
};

// Not reported by type id yet (see the TODO above)
export { Switch1, Switch2 };
