import { MiioApi } from "../../device.js";
import { compose } from "../../things/compose.js";
import { AutonomousCharging } from "../../things/capabilities/charging.js";
import { AdjustableFanSpeed } from "../../things/capabilities/fan-speed.js";
import { AutonomousCleaning } from "../../things/capabilities/cleaning.js";
import { BatteryLevel } from "../capabilities/battery-level.js";

/**
 * Base of the vacuums (type `vacuum`): battery level, charging, cleaning and fan speed. `isVacuum(device)` checks for it.
 */
export abstract class VacuumThing extends compose(
  MiioApi,
  BatteryLevel,
  AutonomousCharging,
  AutonomousCleaning,
  AdjustableFanSpeed,
) {
  static get type() {
    return "vacuum";
  }
}
