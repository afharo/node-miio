import { Capability } from "../capability";
import {
  boolean,
  concentration,
  duration,
  energy,
  illuminance,
  number,
  percentage,
  power,
  pressure,
  temperature,
  voltage,
  type Quantity,
} from "../values";

/** The state key of each sensor capability */
const SENSOR_KEYS: Record<string, string> = {
  temperature: "temperature",
  "relative-humidity": "relativeHumidity",
  "pm2.5": "pm2.5",
  pm10: "pm10",
  illuminance: "illuminance",
  "atmospheric-pressure": "atmosphericPressure",
  "power-load": "powerLoad",
  "power-consumed": "powerConsumed",
  voltage: "voltage",
  "carbon-dioxide": "carbonDioxide",
  contact: "contact",
  motion: "motion",
};

/** Base of the sensors: each value is a state key, and emits `<key>Changed` */
export class Sensor extends Capability {
  static type = "sensor";

  /** The state keys of the sensors of this thing */
  get sensorTypes(): string[] {
    return [...this.metadata.capabilities]
      .map((capability) => SENSOR_KEYS[capability])
      .filter((key): key is string => key !== undefined);
  }

  /**
   * The value of a sensor.
   *
   * @param sensorType Its state key
   * @returns The value
   */
  value<T = unknown>(sensorType: string): Promise<T> {
    return Promise.resolve(this.getState<T>(sensorType));
  }

  /** The values of all the sensors */
  values(): Promise<Record<string, unknown>> {
    return Promise.resolve(
      Object.fromEntries(
        this.sensorTypes.map((type) => [type, this.getState(type)]),
      ),
    );
  }

  /**
   * Updates the value of a sensor. Emits `<sensorType>Changed`.
   *
   * @param sensorType Its state key
   * @param value The value
   * @returns `true` if it changed
   */
  updateValue(sensorType: string, value: unknown) {
    if (this.updateState(sensorType, value)) {
      this.emitEvent(`${sensorType}Changed`, value);
      return true;
    }
    return false;
  }
}

export class Temperature extends Sensor {
  static capability = "temperature";

  temperature() {
    return this.value<Quantity>("temperature");
  }

  updateTemperature(value: unknown) {
    this.updateValue("temperature", temperature(value));
  }
}

export class RelativeHumidity extends Sensor {
  static capability = "relative-humidity";

  relativeHumidity() {
    return this.value<number>("relativeHumidity");
  }

  updateRelativeHumidity(value: unknown) {
    this.updateValue("relativeHumidity", percentage(value));
  }
}

export class PM2_5 extends Sensor {
  static capability = "pm2.5";

  pm2_5() {
    return this.value<number>("pm2.5");
  }

  updatePM2_5(value: unknown) {
    this.updateValue("pm2.5", number(value));
  }
}

export class PM10 extends Sensor {
  static capability = "pm10";

  pm10() {
    return this.value<number>("pm10");
  }

  updatePM10(value: unknown) {
    this.updateValue("pm10", concentration(value).value);
  }
}

export class Illuminance extends Sensor {
  static capability = "illuminance";

  illuminance() {
    return this.value<Quantity>("illuminance");
  }

  updateIlluminance(value: unknown) {
    this.updateValue("illuminance", illuminance(value));
  }
}

export class AtmosphericPressure extends Sensor {
  static capability = "atmospheric-pressure";

  atmosphericPressure() {
    return this.value<Quantity>("atmosphericPressure");
  }

  updateAtmosphericPressure(value: unknown) {
    this.updateValue("atmosphericPressure", pressure(value));
  }
}

export class PowerLoad extends Sensor {
  static capability = "power-load";

  powerLoad() {
    return this.value<Quantity>("powerLoad");
  }

  updatePowerLoad(value: unknown) {
    this.updateValue("powerLoad", power(value));
  }
}

export class PowerConsumed extends Sensor {
  static capability = "power-consumed";

  powerConsumed() {
    return this.value<Quantity>("powerConsumed");
  }

  updatePowerConsumed(value: unknown) {
    this.updateValue("powerConsumed", energy(value));
  }
}

export class Voltage extends Sensor {
  static capability = "voltage";

  voltage() {
    return this.value<Quantity>("voltage");
  }

  updateVoltage(value: unknown) {
    this.updateValue("voltage", voltage(value));
  }
}

/** A contact sensor (e.g. a door): `true` when closed. Emits `opened` / `closed`. */
export class Contact extends Sensor {
  static capability = "contact";

  contact() {
    return this.value<boolean>("contact");
  }

  async isOpen() {
    return !(await this.contact());
  }

  isClosed() {
    return this.contact();
  }

  updateContact(contact: unknown) {
    const value = boolean(contact);
    if (this.updateValue("contact", value)) {
      this.emitEvent(value ? "closed" : "opened");
    }
  }
}

const IDLE_TIMER = Symbol("idleTimer");

/** A motion sensor. Emits `movement` / `inactivity`. */
export class Motion extends Sensor {
  static capability = "motion";

  motion() {
    return this.value<boolean>("motion");
  }

  /**
   * Updates the motion state.
   *
   * @param motion Whether there's motion
   * @param autoIdleTimeout Switches back to no motion after this time (e.g. `"1m"`), unless motion is reported again
   */
  updateMotion(motion: unknown, autoIdleTimeout?: number | string | null) {
    const value = boolean(motion);
    if (this.updateValue("motion", value)) {
      this.emitEvent(value ? "movement" : "inactivity");
    }

    const self = this as unknown as { [IDLE_TIMER]?: NodeJS.Timeout };
    clearTimeout(self[IDLE_TIMER]);
    if (value && autoIdleTimeout) {
      self[IDLE_TIMER] = setTimeout(
        () => this.updateMotion(false),
        duration(autoIdleTimeout).ms,
      );
    }
  }

  capabilityDestroy() {
    clearTimeout(
      (this as unknown as { [IDLE_TIMER]?: NodeJS.Timeout })[IDLE_TIMER],
    );
  }
}
