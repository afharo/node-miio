import { MiioApi } from "../device";
import { compose } from "../things/compose";
import { MiioThing } from "../things/thing";
import { SwitchablePower } from "../things/capabilities/common";
import { Children } from "../things/capabilities/children";

import { Power as MiioPower } from "./capabilities/power";

/** The USB port of the plug, switchable on its own */
class USBOutlet extends compose(MiioThing, SwitchablePower) {
  static get types() {
    return ["power-outlet"];
  }

  constructor(private readonly parent: PowerPlugChuangmiV1) {
    super();
    this.id = parent.id + ":usb";
    this.updateName();
  }

  updateName() {
    this.metadata.name =
      (this.parent.metadata.name ?? this.parent.id) + " - USB";
  }

  changePower(power: boolean) {
    return this.parent.call(power ? "set_usb_on" : "set_usb_off", [], {
      refresh: true,
    });
  }
}

/** Mi Smart Socket Plug (`chuangmi.plug.v1`), with a switchable USB port (a child) */
export class PowerPlugChuangmiV1 extends compose(MiioApi, MiioPower, Children) {
  static get types() {
    return ["power-plug", "power-outlet"];
  }

  static get type() {
    return "miio:power-plug";
  }

  constructor(handle: ConstructorParameters<typeof MiioApi>[0]) {
    super(handle);

    this.defineProperty("on", {
      name: "power",
    });

    this.addChild(new USBOutlet(this));
  }

  propertyUpdated(key: string, value: unknown, oldValue?: unknown) {
    if (key === "powerChannelUsb") {
      this.child<USBOutlet>("usb")?.updatePower(value as boolean);
    }
    super.propertyUpdated(key, value, oldValue);
  }
}
