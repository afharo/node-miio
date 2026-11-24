/**
 * Parses one command line value: JSON when it is JSON (objects, arrays, numbers, booleans, null), the text as is
 * otherwise (e.g. `get_status`, or a property name).
 *
 * @param value The value, as yargs gives it (it already turns numbers into numbers)
 * @returns The parsed value
 */
function parseValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * The parameters of a call, from the command line.
 *
 * Each parameter is parsed as JSON when it is, so objects reach the device as objects (e.g. the MIoT
 * `get_properties '{"did":"sn","siid":1,"piid":3}'`). A single JSON array is the whole list of parameters
 * (`get_prop '["temperature","use_time"]'`), as documented.
 *
 * @param params The parameters, as yargs gives them
 * @returns The parameters to send
 */
export function parseCallParams(params: unknown): unknown[] {
  const parsed = parseArgs(params);
  if (parsed.length === 1 && Array.isArray(parsed[0])) return parsed[0];
  return parsed;
}

/**
 * The arguments of a device method, from the command line: each one parsed as JSON when it is (e.g.
 * `cleanRooms '[16,17]'` passes one array).
 *
 * @param params The arguments, as yargs gives them
 * @returns The arguments to pass
 */
export function parseArgs(params: unknown): unknown[] {
  if (params === undefined || params === null) return [];
  return (Array.isArray(params) ? params : [params]).map(parseValue);
}
