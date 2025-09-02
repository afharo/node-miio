declare module "abstract-things/lights" {
  import { Thing } from "abstract-things";
  import type { Color } from "abstract-things/values";
  export class Light extends Thing {}
  export class Dimmable extends Thing {
    updateBrightness(value: number): void;
  }
  export class Fading extends Thing {}
  export class Colorable extends Thing {
    updateColor(value: Color): void;
  }
  export class ColorTemperature extends Thing {}
  export class ColorFull extends Thing {}
}
