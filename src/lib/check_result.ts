/**
 * Helper to validate that the response from the RVC is successful.
 *
 * @param {unknown} r The response of the request
 */
export function checkResult(r: unknown) {
  // console.log(r)
  // {"result":0,"id":17}      = Firmware 3.3.9_003095 (Gen1)
  // {"result":["ok"],"id":11} = Firmware 3.3.9_003194 (Gen1), 3.3.9_001168 (Gen2)
  // {"result":["OK"],"id":11} = Firmware 1.3.0_0752 on Xiaowa E202-02
  if (r !== 0 && Array.isArray(r) && r[0] !== "ok" && r[0] !== "OK") {
    throw new Error("Could not complete call to device");
  }
}
