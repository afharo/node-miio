import { ChannelSwitch } from "./light-channel.js";
import type { SubDeviceInfo, SubDeviceParent } from "./subdevice.js";

/** Two-channel light switch */
export class CtrlNeutral2 extends ChannelSwitch {
  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info, "lumi.ctrl_neutral2", 2);
  }
}
