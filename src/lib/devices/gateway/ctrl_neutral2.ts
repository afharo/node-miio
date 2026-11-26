import { ChannelSwitch } from "./light-channel";
import type { SubDeviceInfo, SubDeviceParent } from "./subdevice";

/** Two-channel light switch */
export class CtrlNeutral2 extends ChannelSwitch {
  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info, "lumi.ctrl_neutral2", 2);
  }
}
