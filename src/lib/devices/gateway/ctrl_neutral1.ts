import { ChannelSwitch } from "./light-channel";
import type { SubDeviceInfo, SubDeviceParent } from "./subdevice";

/** Single-channel light switch */
export class CtrlNeutral1 extends ChannelSwitch {
  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info, "lumi.ctrl_neutral1", 1);
  }
}
