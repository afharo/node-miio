/**
 * Value converters used by the capabilities (e.g. `updateBatteryLevel("50%")`). They normalise the values reported by
 * the devices (or passed by the users) and throw when a value can't be converted.
 */

/**
 * Converts a boolean-ish value (`true`, `"on"`, `"yes"`, `1`, `"1"`…).
 *
 * @param value The value
 * @returns The boolean
 */
export function boolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  switch (String(value).toLowerCase()) {
    case "true":
    case "yes":
    case "on":
    case "1":
      return true;
    case "false":
    case "no":
    case "off":
    case "0":
      return false;
    default:
      throw new Error(`Can not translate \`${String(value)}\` into a boolean`);
  }
}

/**
 * Converts a number, or a numeric string (e.g. `"21.5"`).
 *
 * @param value The value
 * @returns The number
 */
export function number(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") {
    throw new Error("Can not convert into a number, string is needed");
  }
  const parsed = Number(value.trim());
  if (value.trim() === "" || Number.isNaN(parsed)) {
    throw new Error(
      `Could not convert into a number, invalid format for string: ${value}`,
    );
  }
  return parsed;
}

/**
 * Converts any value into a string.
 *
 * @param value The value
 * @returns The string
 */
export function string(value: unknown): string {
  return String(value);
}

export interface PercentageOptions {
  /** Values below it are raised to it */
  min?: number;
  /** Values above it are lowered to it */
  max?: number;
  /** Decimals to round to */
  precision?: number;
}

/**
 * Converts a percentage: a number, or a string like `"50"` or `"50%"`.
 *
 * @param value The value
 * @param options Optional clamping and rounding
 * @returns The percentage
 */
export function percentage(value: unknown, options?: PercentageOptions) {
  let result: number;
  if (typeof value === "string") {
    const trimmed = value.trim();
    result = number(trimmed.endsWith("%") ? trimmed.slice(0, -1) : trimmed);
  } else if (typeof value === "number") {
    result = value;
  } else {
    throw new Error("Can not translate to a percentage");
  }

  if (options?.min !== undefined && result < options.min) result = options.min;
  if (options?.max !== undefined && result > options.max) result = options.max;
  if (options?.precision !== undefined) {
    const p = 10 ** options.precision;
    result = Math.round(result * p) / p;
  }
  return result;
}

/** A relative (`"+10"`, `"-10"`) or absolute (`"10"`) change of a value */
export class Change<T> {
  constructor(
    public readonly value: T,
    public readonly type: "increase" | "decrease" | "set",
  ) {}

  get isIncrease() {
    return this.type === "increase";
  }

  get isDecrease() {
    return this.type === "decrease";
  }

  get isSet() {
    return this.type === "set";
  }
}

const CHANGE = /^\s*([+-])(.+)$/;

/**
 * Parses a percentage change: `"+10"` (increase), `"-10"` (decrease) or `10` / `"10"` (set).
 *
 * @param value The value
 * @returns The change
 */
export function percentageChange(value: unknown): Change<number> {
  if (value instanceof Change) return value;
  if (typeof value === "string") {
    const parsed = CHANGE.exec(value);
    if (parsed) {
      return new Change(
        percentage(parsed[2]),
        parsed[1] === "+" ? "increase" : "decrease",
      );
    }
  }
  return new Change(percentage(value), "set");
}

/** An identifier with an optional description, e.g. an error (`{ id: 10, description: "Filter blocked" }`) or a mode */
export class Code {
  constructor(
    public readonly id: string | number,
    public readonly description?: string,
  ) {}

  /**
   * Parses `"id"` or `"id: description"`.
   *
   * @param value The string
   * @returns The code
   */
  static parse(value: string) {
    const idx = value.indexOf(":");
    return idx >= 0
      ? new Code(value.slice(0, idx).trim(), value.slice(idx + 1).trim())
      : new Code(value.trim());
  }
}

export type CodeInput =
  | Code
  | string
  | number
  | [id: string | number, description?: string]
  | {
      id?: string | number;
      code?: string | number;
      description?: string;
      message?: string;
    };

/**
 * Converts a code: a {@link Code}, `"id"`, `"id: description"`, a number, `[id, description]`,
 * `{ id, description }` or `{ code, message }` (the shape of the errors reported by the vacuums).
 *
 * @param value The value
 * @returns The code
 */
export function code(value: CodeInput): Code {
  if (value instanceof Code) return value;
  if (Array.isArray(value)) return new Code(value[0], value[1]);
  if (typeof value === "object" && value !== null) {
    return new Code(
      (value.id ?? value.code) as string | number,
      value.description ?? value.message,
    );
  }
  if (typeof value === "string") return Code.parse(value);
  if (typeof value === "number") return Code.parse(String(value));
  throw new Error("Can not convert into code");
}

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const DURATION = /^\s*(-?[0-9.]+)\s*(ms|s|m|h|d)?\s*$/;

/** A duration, e.g. a light's transition time */
export class Duration {
  constructor(public readonly ms: number) {}

  get seconds() {
    return this.ms / 1000;
  }

  get value() {
    return this.ms;
  }

  toString() {
    return `${this.ms}ms`;
  }
}

/**
 * Converts a duration: milliseconds, or a string like `"500ms"`, `"30s"`, `"5m"`, `"1h"` or `"1d"`.
 *
 * @param value The value
 * @returns The duration
 */
export function duration(value: unknown): Duration {
  if (value instanceof Duration) return value;
  if (typeof value === "number") return new Duration(value);
  if (typeof value === "string") {
    const parsed = DURATION.exec(value);
    if (parsed) {
      return new Duration(
        Number(parsed[1]) * DURATION_UNITS[parsed[2] ?? "ms"],
      );
    }
  }
  throw new Error(`Can not convert \`${String(value)}\` into a duration`);
}

/** A measurement with its unit, e.g. a temperature (`21.5 °C`) */
export class Quantity {
  constructor(
    public readonly value: number,
    public readonly unit: string,
  ) {}

  toString() {
    return `${this.value} ${this.unit}`;
  }

  valueOf() {
    return this.value;
  }
}

/**
 * Creates a converter for a quantity in the given unit. It accepts numbers, numeric strings and {@link Quantity}s.
 *
 * @param unit The unit of the quantity
 * @returns The converter
 */
export function quantity(unit: string) {
  return (value: unknown): Quantity => {
    if (value instanceof Quantity) return value;
    return new Quantity(number(value), unit);
  };
}

export const temperature = quantity("°C");
export const humidity = quantity("%");
export const illuminance = quantity("lx");
export const pressure = quantity("Pa");
export const power = quantity("W");
export const energy = quantity("Wh");
export const voltage = quantity("V");
export const concentration = quantity("µg/m³");
export const ppm = quantity("ppm");
