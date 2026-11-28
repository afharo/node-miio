import { BatteryLevel } from "../../things/capabilities/battery-level.js";

const VOLTAGE_MIN = 2800;
const VOLTAGE_MAX = 3300;

/**
 * Battery level of the sub-devices that report their voltage (in mV). The sub-device must define the `voltage`
 * property (`this.defineProperty("voltage")`).
 */
export class VoltageBattery extends BatteryLevel {
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "voltage" && value) {
      const level =
        ((Number(value) - VOLTAGE_MIN) / (VOLTAGE_MAX - VOLTAGE_MIN)) * 100;
      this.updateBatteryLevel(Number(level.toFixed(2)));
    }
  }
}
