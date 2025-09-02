declare module "abstract-things/values" {
  export function boolean(value: unknown): boolean;
  export function string(value: unknown): string;
  export const color: Color;

  export interface Color {
    is: (model: unknown) => boolean;
    temperature: (value: unknown) => Color;
    rgb: (red: unknown, green: unknown, blue: unknown) => Color;
    hsv: (hue: unknown, saturation: unknown, brightness: unknown) => Color;
  }
}
