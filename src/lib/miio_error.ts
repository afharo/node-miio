import type { DeviceInfo } from "./device_info";

/**
 * Type Guard for MiioError
 *
 * @param {unknown} error Any possible error
 */
export function isMiioError(error: unknown): error is MiioError {
  return typeof (error as MiioError).code === "string";
}

export class MiioError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public device?: DeviceInfo,
  ) {
    super(message);
  }
}
