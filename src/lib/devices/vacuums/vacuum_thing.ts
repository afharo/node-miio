import { MiioApi } from "../../device";
import { compose } from "../../things/compose";
import { AutonomousCharging } from "../../things/capabilities/charging";
import { AdjustableFanSpeed } from "../../things/capabilities/fan-speed";
import { AutonomousCleaning } from "../../things/capabilities/cleaning";
import { BatteryLevel } from "../capabilities/battery-level";

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
