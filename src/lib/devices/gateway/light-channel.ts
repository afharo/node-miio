import { compose } from "../../things/compose";
import { MiioThing } from "../../things/thing";
import { SwitchablePower } from "../../things/capabilities/power";
import { Children } from "../../things/capabilities/children";
import { Light } from "../../things/capabilities/lights/light";

import {
  SubDevice,
  type SubDeviceInfo,
  type SubDeviceParent,
} from "./subdevice";

/** A light switch with channels (each one a {@link LightChannel} child) */
export abstract class ChannelSwitch extends compose(SubDevice, Children) {
  static get type() {
    return "miio:power-switch";
  }

  static get types() {
    return ["wall-switch"];
  }

  constructor(
    parent: SubDeviceParent,
    info: SubDeviceInfo,
    model: string,
    channels: number,
  ) {
    super(parent, info);
    this.miioModel = model;

    for (let channel = 0; channel < channels; channel++) {
      this.defineProperty(`channel_${channel}`, {
        name: `powerChannel${channel}`,
        mapper: (v: string) => v === "on",
      });
      this.addChild(new LightChannel(this, channel));
    }
  }

  /**
   * Switches a channel on or off.
   *
   * @param channel The channel
   * @param power Whether to switch it on
   * @returns The response
   */
  changePowerChannel(channel: number, power: boolean) {
    return this.call("toggle_ctrl_neutral", [
      "neutral_" + channel,
      power ? "on" : "off",
    ]);
  }

  propertyUpdated(key: string, value: unknown, oldValue?: unknown) {
    super.propertyUpdated(key, value, oldValue);

    const channel = /^powerChannel(\d+)$/.exec(key)?.[1];
    if (channel !== undefined) {
      this.child<LightChannel>(channel)?.updatePower(value as boolean);
    }
  }
}

/** A channel of a light switch */
export class LightChannel extends compose(MiioThing, Light, SwitchablePower) {
  static get types() {
    return ["miio:subdevice", "miio:power-channel", "miio:light"];
  }

  constructor(
    private readonly parent: ChannelSwitch,
    readonly channel: number,
  ) {
    super();
    this.id = parent.id + ":" + channel;
    this.updateName();
  }

  updateName() {
    this.metadata.name =
      (this.parent.metadata.name ?? this.parent.id) + " - " + this.channel;
  }

  changePower(power: boolean) {
    return this.parent.changePowerChannel(this.channel, power);
  }
}
