/* eslint-disable */

import * as miio from "./dist/lib/index.js";

// Create a new device over the given address
miio
  .device({
    address: "ipHere",
  })
  .then((device) => {
    console.log("Connected to device");
    console.log(device);
  })
  .catch((err) => console.log("Error occurred:", err));
