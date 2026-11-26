import { MiioApi } from "../device";
import { compose } from "../things/compose";
import { ChargingState } from "../things/capabilities/common";

import { Power } from "./capabilities/power";
import { BatteryLevel } from "./capabilities/battery-level";
import { AQI } from "./capabilities/sensor";

export class AirMonitor extends compose(
  MiioApi,
  Power,
  AQI,
  BatteryLevel,
  ChargingState,
) {
  static get type() {
    return "miio:air-monitor";
  }

  static get types() {
    return ["air-monitor"];
  }

  constructor(options) {
    super(options);

    // Define the power property
    this.defineProperty("power", (v) => v === "on");

    // Sensor value used for AQI (PM2.5) capability
    this.defineProperty("aqi");

    this.defineProperty("battery", {
      name: "batteryLevel",
    });

    this.defineProperty("usb_state", {
      name: "charging",
      mapper: (v: string) => v === "on",
    });
  }

  propertyUpdated(key, value, oldValue) {
    if (key === "charging") {
      this.updateCharging(value as boolean);
    }

    super.propertyUpdated(key, value, oldValue);
  }

  changePower(power) {
    return this.call("set_power", [power ? "on" : "off"], {
      refresh: ["power", "mode"],
      refreshDelay: 200,
    });
  }
}
