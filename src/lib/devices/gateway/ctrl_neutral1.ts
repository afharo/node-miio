import { ChannelSwitch } from "./light-channel.js";
import type { SubDeviceInfo, SubDeviceParent } from "./subdevice.js";

/** Single-channel light switch */
export class CtrlNeutral1 extends ChannelSwitch {
  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info, "lumi.ctrl_neutral1", 1);
  }
}
