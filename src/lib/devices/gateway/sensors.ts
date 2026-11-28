import { compose } from "../../things/compose.js";
import { Contact, Motion } from "../../things/capabilities/sensors.js";
import {
  AtmosphericPressure,
  Humidity,
  Illuminance,
  Temperature,
} from "../capabilities/sensor.js";

import {
  SubDevice,
  type SubDeviceInfo,
  type SubDeviceParent,
} from "./subdevice.js";
import { VoltageBattery } from "./voltage.js";

/** Door and window sensor (`lumi.magnet`): closed when the magnet is close */
export class Magnet extends compose(SubDevice, Contact, VoltageBattery) {
  constructor(
    parent: SubDeviceParent,
    info: SubDeviceInfo,
    model = "lumi.magnet",
  ) {
    super(parent, info);
    this.miioModel = model;
    this.defineProperty("status");
    this.defineProperty("voltage");
  }

  propertyUpdated(key: string, value: unknown, oldValue?: unknown) {
    if (key === "status") {
      this.updateContact(value === "close");
    }
    super.propertyUpdated(key, value, oldValue);
  }
}

/** Aqara door and window sensor (`lumi.magnet.aq2`) */
export class MagnetAq2 extends Magnet {
  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info, "lumi.magnet.aq2");
  }
}

/** Motion sensor (`lumi.motion`): motion goes back to idle after a minute */
export class MotionSensor extends compose(SubDevice, Motion, VoltageBattery) {
  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info);
    this.miioModel = "lumi.motion";
    this.defineProperty("voltage");
    this.updateMotion(false);
  }

  _report(data: Record<string, unknown>) {
    super._report(data);
    if (data.status === "motion") this.updateMotion(true, "1m");
  }
}

/** Aqara motion sensor, with illuminance (`lumi.motion.aq2`) */
export class MotionSensorAq2 extends compose(
  SubDevice,
  Motion,
  Illuminance,
  VoltageBattery,
) {
  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info);
    this.miioModel = "lumi.motion.aq2";
    this.defineProperty("status");
    this.defineProperty("lux", { name: "illuminance" });
    this.defineProperty("voltage");
  }

  _report(data: Record<string, unknown>) {
    super._report(data);
    if (data.status === "motion") this.updateMotion(true, "1m");
  }
}

/** Temperature and humidity sensor (`lumi.sensor_ht`) */
export class SensorHT extends compose(
  SubDevice,
  Temperature,
  Humidity,
  VoltageBattery,
) {
  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info);
    this.miioModel = "lumi.sensor_ht";
    this.defineProperty("temperature", (v: number) => v / 100.0);
    this.defineProperty("humidity", (v: number) => v / 100.0);
    this.defineProperty("voltage");
  }
}

/** Aqara temperature, humidity and pressure sensor (`lumi.weather`) */
export class WeatherSensor extends compose(
  SubDevice,
  Temperature,
  Humidity,
  AtmosphericPressure,
  VoltageBattery,
) {
  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info);
    this.miioModel = "lumi.weather";
    this.defineProperty("temperature", (v: number) => v / 100.0);
    this.defineProperty("humidity", (v: number) => v / 100.0);
    this.defineProperty("pressure", { name: "atmosphericPressure" });
    this.defineProperty("voltage");
  }
}
