import { Capability } from "../../capability";
import { duration, type Duration } from "../../values";

const MAX_CHANGE_TIME = Symbol("maxChangeTime");

type WithMaxChangeTime = { [MAX_CHANGE_TIME]?: Duration };

/** Can fade between changes, up to a maximum time */
export class Fading extends Capability {
  static capability = "fading";

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
