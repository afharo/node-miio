import { Capability } from "../../capability";
import { duration, type Duration } from "../../values";
import { color, type Color, type ColorInput } from "../../color";
import type { ActionDefinition } from "../../action_metadata";

import { DEFAULT_LIGHT_DURATION, type LightChangeOptions } from "./light";

/** The colour can be changed. Implement `changeColor(color, options)`. */
export class Colorable extends Capability {
  static capability = "colorable";
  static actions: ActionDefinition[] = [
    {
      name: "color",
      description: "Gets the colour, or changes it",
      arguments: [
        { type: "color", optional: true, description: "The colour to set" },
        { type: "duration", optional: true, description: "The transition" },
      ],
      returns: "color",
    },
    {
      name: "setColor",
      description: "Changes the colour",
      arguments: [
        { type: "color", description: "The colour" },
        { type: "duration", optional: true, description: "The transition" },
      ],
      returns: "color",
    },
  ];

  /**
   * Gets the colour, or changes it.
   *
   * @param value The colour to set
   * @param transition The transition
   * @returns The colour
   */
  color(
    value?: ColorInput,
    transition: number | string | Duration = DEFAULT_LIGHT_DURATION,
  ): Promise<Color | null> {
    if (value) return this.setColor(value, transition);
    return Promise.resolve(this.getState<Color | null>("color"));
  }

  /**
   * Changes the colour.
   *
   * @param value The colour
   * @param transition The transition
   * @returns The new colour
   */
  async setColor(
    value: ColorInput,
    transition: number | string | Duration = DEFAULT_LIGHT_DURATION,
  ): Promise<Color | null> {
    if (value === undefined) throw new Error("Color must be specified");
    await this.changeColor(color(value), { duration: duration(transition) });
    return this.getState<Color | null>("color");
  }

  /**
   * Updates the colour. Emits `colorChanged`.
   *
   * @param value The colour
   */
  updateColor(value: Color) {
    if (this.updateState("color", value)) {
      this.emitEvent("colorChanged", value);
    }
  }

  /**
   * Changes the colour of the device. Implemented by the devices.
   *
   * @param _color The colour
   * @param _options The transition
   */
  changeColor(_color: Color, _options: LightChangeOptions): Promise<unknown> {
    throw new Error("changeColor not implemented");
  }
}
