/**
 * Payload of the `stateChanged` event (`device.on("stateChanged", ...)`), emitted for every change of `state()`.
 */
export interface StateChangedEvent {
  key: string;
  value: unknown;
}

/**
 * Payload of the `errorChanged` event (`device.on("errorChanged", ...)`): the error, or `null` when it's cleared.
 *
 * abstract-things converts the errors set by the devices (`{ code, message }`) into this shape.
 */
export type ErrorChangedEvent = {
  /** The error code, e.g. `10` (Roborock) or `"charging-error"` */
  id: number | string;
  /** A human-readable description, if known */
  description?: string;
} | null;
