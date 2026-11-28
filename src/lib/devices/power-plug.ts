import { MiioApi } from "../device.js";
import { compose } from "../things/compose.js";

import { Power } from "./capabilities/power.js";

/** Mi Smart Socket Plugs */
export class PowerPlug extends compose(MiioApi, Power) {
  static get types() {
    return ["power-plug", "power-outlet"];
  }

  static get type() {
    return "miio:power-plug";
  }

  constructor(handle: ConstructorParameters<typeof MiioApi>[0]) {
    super(handle);

    this.defineProperty("power", {
      name: "power",
      mapper: (v: string) => v === "on",
    });
  }

  changePower(power: boolean) {
    return this.call("set_power", [power ? "on" : "off"], {
      refresh: ["power"],
    });
  }
}
