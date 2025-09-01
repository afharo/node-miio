"use strict";

import { type FindDeviceViaAddressOptions, network } from "./network";
import { Device } from "./device";
import { Placeholder } from "./placeholder";
import models from "./models";
import Vacuum from "./devices/vacuums/vacuum";
import ViomiVacuum from "./devices/vacuums/viomivacuum";
import DreameVacuum from "./devices/vacuums/dreamevacuum";
import { isMiioError, MiioError } from "./miio_error";
import type { DeviceInfo } from "./device_info";

interface ConnectToDeviceOptions extends FindDeviceViaAddressOptions {
  withPlaceholder?: boolean;
}

/**
 *
 * @param options
 */
export async function connectToDevice(options: ConnectToDeviceOptions) {
  const handle = network.ref();
  let device: typeof Device;

  try {
    // Connecting to a device via IP, ask the network if it knows about it
    const deviceInfo = await network.findDeviceViaAddress(options);
    const deviceHandle = {
      ref: network.ref(),
      api: deviceInfo,
    };

    // Try to resolve the correct model, otherwise use the generic device
    let d = models[deviceInfo.model];

    // Hack to accept any vacuum in the form of 'WORD.vacuum.*'
    if (!d && deviceInfo.model?.match(/^\w+\.vacuum\./)) {
      d = Vacuum;
      if (deviceInfo.model?.startsWith("viomi.")) {
        d = ViomiVacuum;
      } else if (deviceInfo.model?.startsWith("dreame.")) {
        d = DreameVacuum;
      }
    }

    if (!d) {
      device = new Device(deviceHandle);
    } else {
      device = new d(deviceHandle);
    }
  } catch (e) {
    if (
      isMiioError(e) &&
      (e.code === "missing-token" || e.code === "connection-failure") &&
      options.withPlaceholder
    ) {
      const deviceHandle = {
        ref: network.ref(),
        api: e.device as DeviceInfo,
      };

      device = new Placeholder(deviceHandle);
    } else {
      // Error handling - make sure to always release the handle
      handle.release();

      (e as MiioError).device = void 0;
      throw e;
    }
  }
  // Make sure to release the handle
  handle.release();

  return device.init();
}
