import { type FindDeviceViaAddressOptions, network } from "./network";
import { Device, IDevice } from "./device";
import { Placeholder } from "./placeholder";
import { models } from "./models";
import { Vacuum } from "./devices/vacuums/vacuum";
import { ViomiVacuum } from "./devices/vacuums/viomivacuum";
import { DreameVacuum } from "./devices/vacuums/dreamevacuum";
import {
  isPlaceholderSpec,
  isSupportedMiotVacuum,
  MiotVacuum,
} from "./devices/vacuums/miot-vacuum";
import { getMiotSpecClient } from "./miot/spec_client";
import { MiotSpecIndex } from "./miot/miot_spec";
import { isMiioError, MiioError } from "./miio_error";
import type { DeviceInfo } from "./device_info";

export interface ConnectToDeviceOptions extends FindDeviceViaAddressOptions {
  withPlaceholder?: boolean;
}

/**
 * Vacuum brands that always speak the legacy miIO protocol (their MIoT specs are stubs for the cloud/voice assistants).
 * Viomi is not listed: older models (v6/v7/v8/v10…) publish placeholder specs and fall back to `ViomiVacuum`, while
 * newer ones (v13, v18…) are real MIoT devices.
 */
const LEGACY_VACUUM_MODEL = /^(roborock|rockrobo)\./;

/**
 * Brands with both legacy miIO and MIoT models: placeholder specs mean "legacy miIO" for them.
 * (For other brands, a small spec may still be a genuine MIoT device, and there's no working legacy fallback.)
 */
const LEGACY_WHEN_PLACEHOLDER_SPEC = /^viomi\./;

type DeviceHandleForConnect = ConstructorParameters<typeof Device>[0];

/**
 * Tries to create a spec-driven vacuum. It only succeeds if a spec is available, it describes a supported vacuum,
 * and the device responds to `get_properties` for its status (so devices that only speak legacy miIO keep working).
 *
 * @param model The device model
 * @param handle The device handle
 * @returns The device, or `undefined` if MIoT can't be used
 */
async function tryMiotVacuum(
  model: string,
  handle: DeviceHandleForConnect,
): Promise<IDevice | undefined> {
  const resolved = await getMiotSpecClient()
    .getSpec(model)
    .catch(() => undefined);
  if (
    !resolved ||
    !isSupportedMiotVacuum(resolved.spec) ||
    (LEGACY_WHEN_PLACEHOLDER_SPEC.test(model) &&
      isPlaceholderSpec(resolved.spec))
  ) {
    return undefined;
  }

  const status = new MiotSpecIndex(resolved.spec).property("vacuum", "status");
  if (!status) return undefined;
  try {
    const [result] = await handle.api.call("get_properties", [
      { did: "status", siid: status.siid, piid: status.piid },
    ]);
    if (!result || result.code !== 0) return undefined;
  } catch {
    return undefined;
  }
  return new MiotVacuum(handle, resolved.spec) as unknown as IDevice;
}

/**
 *
 * @param options
 */
export async function connectToDevice(options: ConnectToDeviceOptions) {
  const handle = network.ref();
  let device: IDevice;

  try {
    // Connecting to a device via IP, ask the network if it knows about it
    const deviceInfo = await network.findDeviceViaAddress(options);
    const deviceHandle = {
      ref: network.ref(),
      api: deviceInfo,
    };

    // Try to resolve the correct model, otherwise use the generic device
    let d = models[deviceInfo.model as string];

    const model = deviceInfo.model ?? "";
    let miotDevice: IDevice | undefined;

    // Accept any vacuum in the form of 'WORD.vacuum.*'
    if (!d && /^\w+\.vacuum\./.test(model)) {
      if (!LEGACY_VACUUM_MODEL.test(model)) {
        miotDevice = await tryMiotVacuum(model, deviceHandle);
      }
      if (model.startsWith("viomi.")) {
        d = ViomiVacuum;
      } else if (model.startsWith("dreame.")) {
        d = DreameVacuum;
      } else {
        d = Vacuum;
      }
    }

    if (miotDevice) {
      device = miotDevice;
    } else if (!d) {
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
