import { ChannelSwitch } from "./light-channel.js";
import type { SubDeviceInfo, SubDeviceParent } from "./subdevice.js";

/** Two-channel light switch (live+neutral wire version) */
export class CtrlLN2 extends ChannelSwitch {
  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info, "lumi.ctrl_ln2", 2);
  }
}
