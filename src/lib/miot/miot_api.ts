import type { IDevice } from "../device";
import type { MiotActionResult, MiotPropertyResult } from "../protocol";

/** Anything that can send RPC calls to the device (i.e., a device instance) */
export type MiotCaller = Pick<IDevice, "call">;

/** Devices reject `get_properties` requests with too many properties, so they are sent in batches */
export const GET_PROPERTIES_BATCH_SIZE = 10;

export interface MiotPropertyRequest {
  /** Free-form identifier echoed back by the device (we use the property's local name) */
  did: string;
  siid: number;
  piid: number;
}

/**
 * Error returned by a MIoT call (`code !== 0`).
 */
export class MiotError extends Error {
  constructor(
    message: string,
    public readonly code: number,
  ) {
    super(message);
    this.name = "MiotError";
  }
}

/**
 * Reads properties with `get_properties`, in batches.
 *
 * @param device The device
 * @param properties The properties to read
 * @returns The results of every property (check `code === 0` for success)
 */
export async function getProperties(
  device: MiotCaller,
  properties: MiotPropertyRequest[],
): Promise<MiotPropertyResult[]> {
  const results: MiotPropertyResult[] = [];
  for (let i = 0; i < properties.length; i += GET_PROPERTIES_BATCH_SIZE) {
    const batch = properties.slice(i, i + GET_PROPERTIES_BATCH_SIZE);
    const response = await device.call("get_properties", batch);
    results.push(...(Array.isArray(response) ? response : []));
  }
  return results;
}

/**
 * Writes a property with `set_properties`.
 *
 * @param device The device
 * @param property The property to write
 * @param value The value to set
 * @param options Options forwarded to `call` (e.g. `refresh`)
 * @returns The result of the write
 */
export async function setProperty(
  device: MiotCaller,
  property: MiotPropertyRequest,
  value: unknown,
  options?: Parameters<IDevice["call"]>[2],
): Promise<MiotPropertyResult | undefined> {
  const response = await device.call(
    "set_properties",
    [{ ...property, value }],
    options,
  );
  const result = Array.isArray(response) ? response[0] : undefined;
  if (result && result.code !== 0) {
    throw new MiotError(
      `Failed to set ${property.did} (siid ${property.siid}, piid ${property.piid}): code ${result.code}`,
      result.code,
    );
  }
  return result;
}

/**
 * Calls an action.
 *
 * @param device The device
 * @param action The action to call
 * @param action.did Free-form identifier
 * @param action.siid The service id
 * @param action.aiid The action id
 * @param args Input arguments (values for the `in` properties, in order)
 * @param options Options forwarded to `call` (e.g. `refresh`)
 * @returns The result of the action
 */
export async function callAction(
  device: MiotCaller,
  action: { did: string; siid: number; aiid: number },
  args: unknown[] = [],
  options?: Parameters<IDevice["call"]>[2],
): Promise<MiotActionResult> {
  const result = await device.call("action", { ...action, in: args }, options);
  if (result && typeof result === "object" && result.code !== 0) {
    throw new MiotError(
      `Action ${action.did} (siid ${action.siid}, aiid ${action.aiid}) failed: code ${result.code}`,
      result.code,
    );
  }
  return result;
}
