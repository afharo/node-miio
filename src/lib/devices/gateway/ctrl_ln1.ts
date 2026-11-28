import { ChannelSwitch } from "./light-channel.js";
import type { SubDeviceInfo, SubDeviceParent } from "./subdevice.js";

/** Single-channel light switch (live+neutral wire version) */
export class CtrlLN1 extends ChannelSwitch {
  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info, "lumi.ctrl_ln1", 1);
  }
}
