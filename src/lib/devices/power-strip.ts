import { MiioApi } from "../device";
import { compose } from "../things/compose";

import { Power } from "./capabilities/power";
import { Mode } from "./capabilities/mode";

/** Mi Smart Power Strips */
export class PowerStrip extends compose(MiioApi, Power, Mode) {
  static get types() {
    return ["power-strip"];
  }

  static get type() {
    return "miio:power-strip";
  }

  constructor(handle: ConstructorParameters<typeof MiioApi>[0]) {
    super(handle);

    this.defineProperty("power", {
      name: "power",
      mapper: (v: string) => v === "on",
    });

    this.updateModes(["green", "normal"]);

    this.defineProperty("mode");
  }

  changePower(power: boolean) {
    return this.call("set_power", [power ? "on" : "off"], {
      refresh: ["power"],
    });
  }

  changeMode(mode: string) {
    return this.call("set_power_mode", [mode]);
  }
}
