import { Capability } from "../../capability.js";
import { duration, type Duration } from "../../values.js";
import type { ActionDefinition } from "../../action_metadata.js";

const MAX_CHANGE_TIME = Symbol("maxChangeTime");

type WithMaxChangeTime = { [MAX_CHANGE_TIME]?: Duration };

/** Can fade between changes, up to a maximum time */
export class Fading extends Capability {
  static capability = "fading";
  static actions: ActionDefinition[] = [
    {
      name: "maxChangeTime",
      description: "The longest transition it supports",
      returns: "duration",
    },
  ];

  maxChangeTime(): Promise<Duration | undefined> {
    return Promise.resolve((this as WithMaxChangeTime)[MAX_CHANGE_TIME]);
  }

  /**
   * Updates the maximum time of a change.
   *
   * @param time The time (e.g. `"30s"`)
   */
  updateMaxChangeTime(time: number | string | Duration) {
    (this as WithMaxChangeTime)[MAX_CHANGE_TIME] = duration(time);
  }
}
