import { isDeepStrictEqual } from "node:util";

/**
 * Whether a property kept its value, to decide if a change is emitted.
 *
 * Deep and strict, except that `null` and `undefined` are the same: properties whose mapped value is missing are
 * not stored on first load (the behaviour of the `deep-equal` package this replaced).
 *
 * @param a The previous value
 * @param b The new value
 */
export function isSameValue(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  return isDeepStrictEqual(a, b);
}
