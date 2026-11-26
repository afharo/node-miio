import { Capability } from "../../capability";
import { duration, type Duration } from "../../values";

/** The default transition of the light changes */
export const DEFAULT_LIGHT_DURATION = duration(400);

/** Options of a light change */
export interface LightChangeOptions {
  duration: Duration;
}

/** Options of a brightness change */
export interface BrightnessChangeOptions extends LightChangeOptions {
  /** Whether to switch the light on (`false` when dimming down or to 0) */
  powerOn: boolean;
}

/** A light */
export class Light extends Capability {
  static type = "light";
}

/** A light bulb */
export class LightBulb extends Light {
  static type = "light-bulb";
}

/** A light strip */
export class LightStrip extends Light {
  static type = "light-strip";
}
