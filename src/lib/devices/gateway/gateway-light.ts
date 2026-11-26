import { compose } from "../../things/compose";
import { MiioThing } from "../../things/thing";
import { SwitchablePower } from "../../things/capabilities/common";
import { Colorable, Dimmable, Light } from "../../things/capabilities/lights";
import { color, type Color } from "../../things/color";
import type { GatewayBasic } from "../gateway";

interface RGB {
  red: number;
  green: number;
  blue: number;
}

/** The light of the gateways that have one, as a child of the gateway */
export class GatewayLight extends compose(
  MiioThing,
  Light,
  SwitchablePower,
  Dimmable,
  Colorable,
) {
  static get types() {
    return ["miio:subdevice", "miio:gateway-light"];
  }

  readonly model: string;
  readonly internalId: string;

  constructor(private readonly gateway: GatewayBasic) {
    super();

    this.model = gateway.miioModel + ".light";
    this.internalId = (gateway.id ?? "").substring(5) + ":light";
    this.id = gateway.id + ":light";

    // Follow the properties of the gateway
    const propertyUpdated = gateway.propertyUpdated.bind(gateway);
    gateway.propertyUpdated = (key, value, oldValue) => {
      propertyUpdated(key, value, oldValue);
      this.gatewayPropertyUpdated(key, value);
    };
  }

  changePower(power: boolean) {
    return this.changeBrightness(power ? 50 : 0);
  }

  changeBrightness(brightness: number) {
    const { red, green, blue } = this.gateway.property<RGB>("rgb");
    const rgb = (brightness << 24) | (red << 16) | (green << 8) | blue;
    return this.gateway.call("set_rgb", [rgb >>> 0], { refresh: ["rgb"] });
  }

  changeColor(value: Color) {
    const { red, green, blue } = value.rgb;
    const a = this.gateway.property<number>("brightness");
    const rgb = (a << 24) | (red << 16) | (green << 8) | blue;
    return this.gateway.call("set_rgb", [rgb >>> 0], { refresh: ["rgb"] });
  }

  /**
   * Updates the light from the properties of the gateway.
   *
   * @param key The property
   * @param value Its value
   */
  private gatewayPropertyUpdated(key: string, value: unknown) {
    if (key === "rgb") {
      const { red, green, blue } = value as RGB;
      this.updateColor(color.rgb(red, green, blue));
    } else if (key === "brightness") {
      this.updateBrightness(value as number);
      this.updatePower((value as number) > 0);
    }
  }
}
