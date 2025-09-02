import { ChargingState, AutonomousCharging } from "abstract-things";
import {
  Vacuum,
  AdjustableFanSpeed,
  AutonomousCleaning,
  SpotCleaning,
} from "abstract-things/climate";

import { MiioApi } from "../../device";
import { BatteryLevel } from "../capabilities/battery-level";

/**
 * Implementation of the interface used by the Dreame Vacuum. This device
 * doesn't use properties via get_prop but instead has a get_properties.
 */
export class DreameVacuum extends Vacuum.with(
  MiioApi,
  BatteryLevel,
  AutonomousCharging,
  AutonomousCleaning,
  SpotCleaning,
  AdjustableFanSpeed,
  ChargingState,
) {
  static get type() {
    return "miio:vacuum";
  }

  constructor(options) {
    super(options);

    this.defineProperty("device_fault", {
      name: "error",
      siid: this.miioModel === "dreame.vacuum.mc1808" ? 3 : 2,
      piid: this.miioModel === "dreame.vacuum.mc1808" ? 1 : 2,
      mapper: (e) => {
        let message;
        switch (e) {
          // https://python-miio.readthedocs.io/en/latest/api/miio.integrations.dreame.vacuum.dreamevacuum_miot.html#miio.integrations.dreame.vacuum.dreamevacuum_miot.FaultStatus
          case 0:
            return null;
          default:
            message = "Unknown error " + e;
        }
        return {
          code: e,
          message,
        };
      },
    });

    this.defineProperty("device_status", {
      name: "state",
      siid: this.miioModel === "dreame.vacuum.mc1808" ? 3 : 2,
      piid: this.miioModel === "dreame.vacuum.mc1808" ? 2 : 1,
      mapper: (s) => {
        // https://python-miio.readthedocs.io/en/latest/api/miio.integrations.dreame.vacuum.dreamevacuum_miot.html#miio.integrations.dreame.vacuum.dreamevacuum_miot.DeviceStatus
        switch (s) {
          case 1:
            return "sweeping";
          case 2:
            return "idle";
          case 3:
            return "paused";
          case 4:
            return "error";
          case 5:
            return "returning";
          case 6:
            return "charging";
          case 7:
            return "mopping";
          case 8:
            return "drying";
          case 9:
            return "washing";
          case 10:
            return "returning-washing";
          case 11:
            return "building";
          case 12:
            return "sweeping-and-mopping";
          case 13:
            return "fully-charged";
          case 14:
            return "updating";
        }
        return "unknown-" + s;
      },
    });

    // Define the batteryLevel property for monitoring battery
    this.defineProperty("battery_level", {
      name: "batteryLevel",
      siid: this.miioModel === "dreame.vacuum.mc1808" ? 2 : 3,
      piid: 1,
    });

    this.defineProperty("charging_state", {
      name: "charging",
      siid: this.miioModel === "dreame.vacuum.mc1808" ? 2 : 3,
      piid: 2,
      mapper: (s) => {
        switch (s) {
          case 1: // charging
            return true;
          case 2: // discharging
            return false;
          case 4: // charging2
            return true;
          case 5: // go-charging
            return false;
        }
      },
    });

    this.defineProperty("cleaning_mode", {
      name: "fanSpeed",
      siid: this.miioModel === "dreame.vacuum.mc1808" ? 18 : 4,
      piid: this.miioModel === "dreame.vacuum.mc1808" ? 6 : 4,
    });
    this.defineProperty("operating_mode", {
      name: "cleaningMode",
      siid: this.miioModel === "dreame.vacuum.mc1808" ? 18 : 4,
      piid: 1,
      mapper: (v) => {
        switch (v) {
          case 1:
            return "paused";
          case 2:
            return "cleaning";
          case 3:
            return "returning";
          case 6:
            return "charging";
          case 13:
            return "manual-cleaning";
          case 14:
            return "idle";
          case 17:
            return "manual-paused";
          case 19:
            return "zone-cleaning";
        }
        return "unknown-" + v;
      },
    });

    this.defineProperty("water_flow", {
      name: "waterBoxMode",
      siid: 4,
      piid: 5,
    });
  }

  propertyUpdated<T>(key: string, value: T, oldValue?: T) {
    if (key === "state") {
      // Update charging state
      this.updateCharging(value === "charging");

      switch (value) {
        case "cleaning":
        case "spot-cleaning":
        case "zone-cleaning":
        case "room-cleaning":
          // The vacuum is cleaning
          this.updateCleaning(true);
          break;
        case "paused":
          // Cleaning has been paused, do nothing special
          break;
        case "error":
          // An error has occurred, rely on error mapping
          this.updateError(this.property("error"));
          break;
        case "charging-error":
          // Charging error, trigger an error
          this.updateError({
            code: "charging-error",
            message: "Error during charging",
          });
          break;
        case "charger-offline":
          // Charger is offline, trigger an error
          this.updateError({
            code: "charger-offline",
            message: "Charger is offline",
          });
          break;
        default:
          // The vacuum is not cleaning
          this.updateCleaning(false);
          break;
      }
    } else if (key === "fanSpeed") {
      this.updateFanSpeed(value);
    }

    super.propertyUpdated(key, value, oldValue);
  }

  getDeviceInfo() {
    return this.call("miIO.info", []);
  }

  async getSerialNumber() {
    return "unknown";
  }

  getRoomMap() {
    return [];
  }

  getTimer() {
    return [];
  }

  /**
   * Start a cleaning session.
   */
  activateCleaning() {
    return this.call("action", {
      did: "start_clean",
      siid: this.miioModel === "dreame.vacuum.mc1808" ? 3 : 4,
      aiid: 1,
      in: [],
    });
  }

  /**
   * Pause the current cleaning session.
   */
  pause() {
    return this.deactivateCleaning();
  }

  /**
   * Stop the current cleaning session.
   */
  deactivateCleaning() {
    return this.call("action", {
      did: "stop_clean",
      siid: this.miioModel === "dreame.vacuum.mc1808" ? 3 : 4,
      aiid: 2,
      in: [],
    });
  }

  /**
   * Stop the current cleaning session and return to charge.
   */
  async activateCharging() {
    await this.call("action", {
      did: "home",
      siid: this.miioModel === "dreame.vacuum.mc1808" ? 2 : 3,
      aiid: 1,
      in: [],
    });
  }

  /**
   * Set the power of the fan. Usually 38, 60 or 77.
   *
   * @param speed
   */
  changeFanSpeed(speed) {
    return this.call("set_properties", [
      {
        did: "cleaning_mode",
        siid: 18,
        piid: 6,
        value: speed,
      },
    ]);
  }

  setWaterBoxMode(mode) {
    // From https://github.com/marcelrv/XiaomiRobotVacuumProtocol/blob/master/water_box_custom_mode.md
    return this.call("set_properties", [
      {
        did: "water_flow",
        siid: 4,
        piid: 5,
        value: mode,
      },
    ]);
  }

  /**
   * Activate the find function, will make the device give off a sound.
   */
  find() {
    return this.call("action", {
      did: "locate",
      siid: this.miioModel === "dreame.vacuum.mc1808" ? 17 : 7,
      aiid: 1,
      in: [],
    }).then(() => null);
  }

  loadProperties(props) {
    // We override loadProperties to use get_properties
    props = props.map((key) => this._reversePropertyDefinitions[key] || key);

    const properties = props
      .map((prop) => {
        const definition = this._propertyDefinitions[prop];
        if (definition) {
          return {
            did: prop,
            siid: definition.siid,
            piid: definition.piid,
          };
        }
      })
      .filter(Boolean);

    return this.call("get_properties", properties).then((result) => {
      const mapped = {};
      result.forEach((prop) => {
        if (prop.code === 0) {
          this._pushProperty(mapped, prop.did, prop.value);
        }
      });
      return mapped;
    });
  }
}
