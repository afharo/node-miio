import { Capability } from "../capability.js";
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
} from "../values.js";
import type { ActionDefinition } from "../action_metadata.js";

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
  static actions: ActionDefinition[] = [
    {
      name: "value",
      description: "The value of a sensor",
      arguments: [
        { type: "string", description: "The sensor, e.g. temperature" },
      ],
    },
    {
      name: "values",
      description: "The values of all the sensors",
      returns: "object",
    },
  ];

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
  static actions: ActionDefinition[] = [
    {
      name: "temperature",
      description: "The temperature",
      returns: "temperature",
    },
  ];

  temperature() {
    return this.value<Quantity>("temperature");
  }

  updateTemperature(value: unknown) {
    this.updateValue("temperature", temperature(value));
  }
}

export class RelativeHumidity extends Sensor {
  static capability = "relative-humidity";
  static actions: ActionDefinition[] = [
    {
      name: "relativeHumidity",
      description: "The relative humidity",
      returns: "percentage",
    },
  ];

  relativeHumidity() {
    return this.value<number>("relativeHumidity");
  }

  updateRelativeHumidity(value: unknown) {
    this.updateValue("relativeHumidity", percentage(value));
  }
}

export class PM2_5 extends Sensor {
  static capability = "pm2.5";
  static actions: ActionDefinition[] = [
    { name: "pm2_5", description: "The PM2.5 density", returns: "number" },
  ];

  pm2_5() {
    return this.value<number>("pm2.5");
  }

  updatePM2_5(value: unknown) {
    this.updateValue("pm2.5", number(value));
  }
}

export class PM10 extends Sensor {
  static capability = "pm10";
  static actions: ActionDefinition[] = [
    { name: "pm10", description: "The PM10 density", returns: "number" },
  ];

  pm10() {
    return this.value<number>("pm10");
  }

  updatePM10(value: unknown) {
    this.updateValue("pm10", concentration(value).value);
  }
}

export class Illuminance extends Sensor {
  static capability = "illuminance";
  static actions: ActionDefinition[] = [
    {
      name: "illuminance",
      description: "The illuminance",
      returns: "illuminance",
    },
  ];

  illuminance() {
    return this.value<Quantity>("illuminance");
  }

  updateIlluminance(value: unknown) {
    this.updateValue("illuminance", illuminance(value));
  }
}

export class AtmosphericPressure extends Sensor {
  static capability = "atmospheric-pressure";
  static actions: ActionDefinition[] = [
    {
      name: "atmosphericPressure",
      description: "The atmospheric pressure",
      returns: "pressure",
    },
  ];

  atmosphericPressure() {
    return this.value<Quantity>("atmosphericPressure");
  }

  updateAtmosphericPressure(value: unknown) {
    this.updateValue("atmosphericPressure", pressure(value));
  }
}

export class PowerLoad extends Sensor {
  static capability = "power-load";
  static actions: ActionDefinition[] = [
    { name: "powerLoad", description: "The power load", returns: "power" },
  ];

  powerLoad() {
    return this.value<Quantity>("powerLoad");
  }

  updatePowerLoad(value: unknown) {
    this.updateValue("powerLoad", power(value));
  }
}

export class PowerConsumed extends Sensor {
  static capability = "power-consumed";
  static actions: ActionDefinition[] = [
    {
      name: "powerConsumed",
      description: "The power consumed",
      returns: "energy",
    },
  ];

  powerConsumed() {
    return this.value<Quantity>("powerConsumed");
  }

  updatePowerConsumed(value: unknown) {
    this.updateValue("powerConsumed", energy(value));
  }
}

export class Voltage extends Sensor {
  static capability = "voltage";
  static actions: ActionDefinition[] = [
    { name: "voltage", description: "The voltage", returns: "voltage" },
  ];

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
  static actions: ActionDefinition[] = [
    {
      name: "contact",
      description: "Whether it detects contact (closed)",
      returns: "boolean",
    },
    { name: "isOpen", description: "Whether it's open", returns: "boolean" },
    {
      name: "isClosed",
      description: "Whether it's closed",
      returns: "boolean",
    },
  ];

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
  static actions: ActionDefinition[] = [
    {
      name: "motion",
      description: "Whether it detects motion",
      returns: "boolean",
    },
  ];

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
