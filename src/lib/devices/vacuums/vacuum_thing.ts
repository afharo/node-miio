import { MiioApi } from "../../device";
import { compose } from "../../things/compose";
import { AutonomousCharging } from "../../things/capabilities/common";
import {
  AdjustableFanSpeed,
  AutonomousCleaning,
} from "../../things/capabilities/climate";
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
