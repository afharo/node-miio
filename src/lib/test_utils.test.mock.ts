import { vi, type Mock } from "vitest";

import type { DeviceHandle } from "./management";

/**
 * A response for a given method: either a static value or a function that computes it from the params.
 * Throwing (or returning a rejected promise) simulates an error from the device.
 */
export type FakeResponse = unknown | ((params: unknown) => unknown);

export interface FakeHandle {
  handle: DeviceHandle;
  /** The mocked `call` of the low-level API. Use it to assert the RPC calls sent to the device. */
  call: Mock;
}

/**
 * Creates a fake device handle that replays the provided responses instead of talking to a real device.
 * Any method that is not listed in `responses` rejects, so unexpected RPC calls make the test fail.
 *
 * @param model The miIO model (e.g. `roborock.vacuum.s5`)
 * @param responses Map of RPC method to the response the device would return
 * @returns The fake handle and the mocked `call`
 */
export function createFakeHandle(
  model: string,
  responses: Record<string, FakeResponse>,
): FakeHandle {
  const call = vi.fn(async (method: string, params: unknown) => {
    if (!(method in responses)) {
      throw new Error(`Unexpected call to "${method}"`);
    }
    const response = responses[method];
    return typeof response === "function"
      ? response(params)
      : structuredClone(response);
  });

  const handle = {
    ref: { release: vi.fn() },
    api: { id: 1234, model, call },
  } as unknown as DeviceHandle;

  return { handle, call };
}

/**
 * The list of RPC methods (and their params) sent to the device, ignoring the options.
 *
 * @param call The mocked `call` from {@link createFakeHandle}
 * @returns An array of `[method, params]` tuples
 */
export function sentCalls(call: Mock): Array<[string, unknown]> {
  return call.mock.calls.map(([method, params]) => [method, params]);
}
