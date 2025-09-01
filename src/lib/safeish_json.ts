/**
 * Safer JSON parser
 *
 * @param {string} str The string to parse into a JSON
 * @returns {T} The parsed JSON
 */
export function safeishJSON<T>(str: string): T {
  try {
    return JSON.parse(str);
  } catch (_error) {
    // Case 1: Load for subdevices fail as they return empty values
    str = str.replace("[,]", "[null,null]");
    // for aqara body sensor (lumi.motion.aq2)
    str = str.replace("[,,]", "[null,null,null]");

    return JSON.parse(str);
  }
}
