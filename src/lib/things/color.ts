import colorString from "color-string";

/** The colour models a {@link Color} can be expressed in */
export type ColorModel = "rgb" | "hsl" | "hsv" | "temperature" | "mired";

const TEMPERATURE = /^\s*([0-9]+)\s*[kK]\s*$/;

const NAMED_TEMPERATURES: Record<string, number> = {
  overcast: 6500,
  daylight: 5500,
  sunrise: 2400,
  sunset: 2400,
  candle: 2000,
  moonlight: 4100,
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * The RGB colour of a black body at the given temperature (Tanner Helland's approximation).
 *
 * @param kelvins The temperature
 * @returns The `[r, g, b]` values (0-255)
 */
function temperatureToRgb(kelvins: number): number[] {
  const t = kelvins / 100;
  const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const green =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492;
  let blue: number;
  if (t >= 66) blue = 255;
  else if (t <= 19) blue = 0;
  else blue = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [red, green, blue].map((v) => Math.round(clamp(v, 0, 255)));
}

/**
 * The temperature whose colour is the closest to the given one (by its blue/red ratio).
 *
 * @param rgb The `[r, g, b]` values (0-255)
 * @returns The temperature in kelvins
 */
function rgbToTemperature(rgb: number[]): number {
  const [r, , b] = rgb;
  if (r === 0) throw new Error("Can not convert to temperature");
  const target = b / r;
  let min = 1000;
  let max = 40000;
  while (max - min > 1) {
    const mid = (min + max) / 2;
    const [mr, , mb] = temperatureToRgb(mid);
    if (mb / mr >= target) max = mid;
    else min = mid;
  }
  return Math.round(min);
}

/**
 * Converts RGB to HSV or HSL.
 *
 * @param rgb The `[r, g, b]` values (0-255)
 * @param model `hsv` or `hsl`
 * @returns `[hue (0-360), saturation (0-100), value or lightness (0-100)]`
 */
function rgbToHs(rgb: number[], model: "hsv" | "hsl"): number[] {
  const [r, g, b] = rgb;
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
  }
  hue = Math.round((hue * 60 + 360) % 360);

  if (model === "hsv") {
    const saturation = max === 0 ? 0 : delta / max;
    return [hue, Math.round(saturation * 100), Math.round(max * 100)];
  }
  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return [hue, Math.round(saturation * 100), Math.round(lightness * 100)];
}

/**
 * Converts HSV or HSL to RGB.
 *
 * @param hs `[hue (0-360), saturation (0-100), value or lightness (0-100)]`
 * @param model `hsv` or `hsl`
 * @returns The `[r, g, b]` values (0-255)
 */
function hsToRgb(hs: number[], model: "hsv" | "hsl"): number[] {
  const [h, s, v] = hs;
  const sn = s / 100;
  const vn = v / 100;
  const chroma = model === "hsv" ? vn * sn : (1 - Math.abs(2 * vn - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((hp % 2) - 1));
  const m = model === "hsv" ? vn - chroma : vn - chroma / 2;
  const [r1, g1, b1] =
    hp < 1
      ? [chroma, x, 0]
      : hp < 2
        ? [x, chroma, 0]
        : hp < 3
          ? [0, chroma, x]
          : hp < 4
            ? [0, x, chroma]
            : hp < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return [r1, g1, b1].map((c) => Math.round((c + m) * 255));
}

/**
 * Converts values of a model to RGB, the hub of the conversions.
 *
 * @param values The values
 * @param model Their model
 * @returns The `[r, g, b]` values
 */
function toRgb(values: number[], model: ColorModel): number[] {
  switch (model) {
    case "rgb":
      return values.slice(0, 3);
    case "hsv":
    case "hsl":
      return hsToRgb(values, model);
    case "temperature":
      return temperatureToRgb(values[0]);
    case "mired":
      return temperatureToRgb(Math.round(1_000_000 / values[0]));
  }
}

/**
 * Converts the values of a model to another one.
 *
 * @param values The values
 * @param from Their model
 * @param to The target model
 * @returns The converted values
 */
function convert(values: number[], from: ColorModel, to: ColorModel) {
  if (from === to) return values;
  if (from === "temperature" && to === "mired") {
    return [Math.round(1_000_000 / values[0])];
  }
  if (from === "mired" && to === "temperature") {
    return [Math.round(1_000_000 / values[0])];
  }
  const rgb = toRgb(values, from);
  switch (to) {
    case "rgb":
      return rgb;
    case "hsv":
    case "hsl":
      return rgbToHs(rgb, to);
    case "temperature":
      return [rgbToTemperature(rgb)];
    case "mired":
      return [Math.round(1_000_000 / rgbToTemperature(rgb))];
  }
}

/**
 * A colour, in one of several models. Convert it with `.rgb`, `.hsv`, `.hsl`, `.temperature` or `.mired`, and read the
 * components of its model (e.g. `.red`, `.hue`, `.kelvins`).
 */
export class Color {
  constructor(
    public readonly values: number[],
    public readonly model: ColorModel,
  ) {}

  /**
   * The colour in another model.
   *
   * @param model The model
   * @returns The converted colour (or this one, if it's already in that model)
   */
  as(model: ColorModel): Color {
    return this.model === model
      ? this
      : new Color(convert(this.values, this.model, model), model);
  }

  /**
   * Whether the colour is expressed in the given model.
   *
   * @param model The model
   * @returns `true` if it is
   */
  is(model: ColorModel) {
    return this.model === model;
  }

  get rgb() {
    return this.as("rgb");
  }

  get hsl() {
    return this.as("hsl");
  }

  get hsv() {
    return this.as("hsv");
  }

  get temperature() {
    return this.as("temperature");
  }

  get mired() {
    return this.as("mired");
  }

  /** The colour as `#rrggbb` */
  get hex() {
    return colorString.to.hex(this.rgb.values).toLowerCase();
  }

  get red() {
    return this.component(0, "rgb");
  }

  get green() {
    return this.component(1, "rgb");
  }

  get blue() {
    return this.component(2, "rgb");
  }

  get hue() {
    return this.component(0, "hsl", "hsv");
  }

  get saturation() {
    return this.component(1, "hsl", "hsv");
  }

  get lightness() {
    return this.component(2, "hsl");
  }

  /** The value (`hsv`) or the mireds (`mired`) */
  get value() {
    return this.component(this.model === "mired" ? 0 : 2, "hsv", "mired");
  }

  get kelvins() {
    return this.component(0, "temperature");
  }

  private component(index: number, ...models: ColorModel[]) {
    if (!models.includes(this.model)) {
      throw new Error(`Need to convert to one of: ${models.join(",")}`);
    }
    return this.values[index];
  }

  toJSON() {
    return { values: this.values, model: this.model };
  }
}

/**
 * Parses a colour string: a temperature (`"4000K"`, `"daylight"`), a CSS colour (`"red"`, `"#ff0000"`, `"rgb(…)"`,
 * `"hsl(…)"`).
 *
 * @param value The string
 * @returns The colour
 */
function parse(value: string): Color {
  const t = TEMPERATURE.exec(value);
  if (t) return new Color([parseInt(t[1], 10)], "temperature");

  const named = NAMED_TEMPERATURES[value.trim().toLowerCase()];
  if (named) return new Color([named], "temperature");

  const parsed = colorString.get(value);
  if (!parsed || parsed.model === "hwb") {
    throw new Error(`Unable to convert to color: ${value}`);
  }
  return new Color(parsed.value.slice(0, 3), parsed.model);
}

export type ColorInput =
  | Color
  | string
  | number[]
  | { values: number[]; model: ColorModel };

/**
 * Converts a colour: a {@link Color}, a string (see `parse`), `[values]` with a model, or `{ values, model }`.
 * Also has a factory per model: `color.rgb(255, 0, 0)`, `color.temperature(4000)`…
 *
 * @param value The value
 * @param model The model, when `value` is an array
 * @returns The colour
 */
export function color(value: ColorInput, model: ColorModel = "rgb"): Color {
  if (value instanceof Color) return value;
  if (typeof value === "string") return parse(value);
  if (Array.isArray(value)) return new Color(value, model);
  if (typeof value === "object" && value !== null) {
    return new Color(value.values, value.model);
  }
  throw new Error("Unable to create color");
}

color.rgb = (red: number, green: number, blue: number) =>
  new Color([red, green, blue], "rgb");
color.hsl = (hue: number, saturation: number, lightness: number) =>
  new Color([hue, saturation, lightness], "hsl");
color.hsv = (hue: number, saturation: number, value: number) =>
  new Color([hue, saturation, value], "hsv");
color.temperature = (kelvins: number) => new Color([kelvins], "temperature");
color.mired = (mireds: number) => new Color([mireds], "mired");
