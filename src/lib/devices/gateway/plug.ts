import { compose } from "../../things/compose.js";
import { Power } from "../capabilities/power.js";
import { PowerConsumed, PowerLoad } from "../capabilities/sensor.js";

import {
  SubDevice,
  type SubDeviceInfo,
  type SubDeviceParent,
} from "./subdevice.js";

/** Wall plug (`lumi.plug`): can be switched on and off, and reports its load and consumption */
export class Plug extends compose(SubDevice, Power, PowerLoad, PowerConsumed) {
  static get types() {
    return ["power-plug", "power-outlet"];
  }

  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info);
    this.miioModel = "lumi.plug";

    this.defineProperty("status", {
      name: "power",
      mapper: (v: string) => (v === "" ? undefined : v === "on"),
    });
    this.defineProperty("load_voltage", {
      name: "loadVoltage",
      mapper: (v: string) => parseInt(v, 10),
    });
    this.defineProperty("load_power", {
      name: "powerLoad",
      mapper: (v: string) => parseInt(v, 10),
    });
    this.defineProperty("power_consumed", {
      name: "powerConsumed",
      mapper: (v: string) => parseFloat(v),
    });
  }

  changePower(power: boolean) {
    return this.call("toggle_plug", ["neutral_0", power ? "on" : "off"]);
  }
}
