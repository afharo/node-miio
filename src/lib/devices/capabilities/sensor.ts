import {
  AtmosphericPressure as BaseAtmosphericPressure,
  Illuminance as BaseIlluminance,
  PM2_5,
  PowerConsumed as BasePowerConsumed,
  PowerLoad as BasePowerLoad,
  RelativeHumidity,
  Temperature as BaseTemperature,
} from "../../things/capabilities/sensors.js";

/** Temperature, following the `temperature` property */
export class Temperature extends BaseTemperature {
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "temperature") this.updateTemperature(value);
  }
}

/** Relative humidity, following the `humidity` property */
export class Humidity extends RelativeHumidity {
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "humidity") this.updateRelativeHumidity(value);
  }
}

/** Illuminance, following the `illuminance` property */
export class Illuminance extends BaseIlluminance {
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "illuminance") this.updateIlluminance(value);
  }
}

/** PM2.5, following the `aqi` property */
export class AQI extends PM2_5 {
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "aqi") this.updatePM2_5(value);
  }
}

/** Atmospheric pressure, following the `atmosphericPressure` property */
export class AtmosphericPressure extends BaseAtmosphericPressure {
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "atmosphericPressure") this.updateAtmosphericPressure(value);
  }
}

/** Power load, following the `powerLoad` property */
export class PowerLoad extends BasePowerLoad {
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "powerLoad") this.updatePowerLoad(value);
  }
}

/** Power consumed, following the `powerConsumed` property */
export class PowerConsumed extends BasePowerConsumed {
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "powerConsumed") this.updatePowerConsumed(value);
  }
}
