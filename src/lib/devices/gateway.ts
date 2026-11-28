import { MiioApi } from "../device.js";
import { compose } from "../things/compose.js";
import { Children, ChildSyncer } from "../things/capabilities/children.js";
import type { MiioThing } from "../things/thing.js";
import type { ActionDefinition } from "../things/action_metadata.js";

import { Illuminance } from "./capabilities/sensor.js";
import DeveloperApi from "./gateway/developer-api.js";
import { GatewayLight } from "./gateway/gateway-light.js";
import { SubDevice } from "./gateway/subdevice.js";
import { subDeviceTypes, type SubDeviceClass } from "./gateway/subdevices.js";

const CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Generate a key for use with the local developer API. This does not generate
 * a secure key, but the Mi Home app does not seem to do that either.
 *
 * @returns The key
 */
function generateKey() {
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

/**
 * Strips the `lumi.` prefix of an id.
 *
 * @param id The id
 * @returns The id without the prefix
 */
function stripLumiFromId(id: string) {
  return id.indexOf("lumi.") === 0 ? id.substring(5) : id;
}

/** A sub-device reported by the gateway, or an extra child (e.g. its light) */
type ChildDefinition =
  | { id: string; type: string; online: boolean; metadata?: undefined }
  | (MiioThing & { id: string });

/**
 * Abstraction over a Mi Smart Home Gateway.
 *
 * This device is very different from most other miIO-devices in that it has
 * devices on its own. There seems to be a way to talk to these devices by
 * setting `sid` in the requests, which means we can poll them. The problem
 * is that certain devices also send events, but these seem to only be
 * accessible over a local developer connection.
 *
 * So to work around this we activate the local developer connection and use
 * that together with the regular calls for changing things on the gateway.
 */
export class GatewayBasic extends compose(MiioApi, Children) {
  static actions: ActionDefinition[] = [
    {
      name: "addDevice",
      description: "Lets Zigbee devices join (pairing mode)",
    },
    { name: "stopAddDevice", description: "Stops letting devices join" },
    {
      name: "removeDevice",
      description: "Removes a sub-device",
      arguments: [{ type: "string", description: "Its id" }],
    },
  ];

  static get type() {
    return "miio:gateway";
  }

  static get SubDevice() {
    return SubDevice;
  }

  /**
   * Registers the class of a type of sub-device.
   *
   * @param id The type id reported by the gateway
   * @param deviceClass The class
   */
  static registerSubDevice(id: string | number, deviceClass: SubDeviceClass) {
    subDeviceTypes[id] = deviceClass;
  }

  devApi?: InstanceType<typeof DeveloperApi>;
  readonly extraChildren: (MiioThing & { id: string })[] = [];
  readonly syncer: ChildSyncer<ChildDefinition>;
  /** @internal */
  _developerKey?: string;
  /** @internal */
  _deviceListTimer?: NodeJS.Timeout;

  constructor(handle: ConstructorParameters<typeof MiioApi>[0]) {
    super(handle);

    this.defineProperty("illumination", {
      name: "illuminance",
    });

    this.defineProperty("rgb", {
      name: "rgb",
      handler: (result, rgba) => {
        const value = rgba as number;
        result["rgb"] = {
          red: 0xff & (value >> 16),
          green: 0xff & (value >> 8),
          blue: 0xff & value,
        };
        result["brightness"] = Math.round(0xff & (value >> 24));
      },
    });

    this.syncer = new ChildSyncer<ChildDefinition>(this, (def, current) => {
      // An extra child (e.g. the light) is the thing itself
      if (def.metadata && def.id) return def as MiioThing;

      const sub = def as Exclude<ChildDefinition, MiioThing>;
      if (!sub.online) return undefined;
      if (current) return current;

      const Type = subDeviceTypes[sub.type] ?? SubDevice;
      return new Type(this, { id: sub.id, model: "lumi.generic." + sub.type });
    });
  }

  /**
   * Updates the properties reported by the developer API.
   *
   * @param properties The raw properties
   */
  _report(properties: Record<string, unknown>) {
    for (const key of Object.keys(properties)) {
      this.setRawProperty(key, properties[key]);
    }
  }

  async initCallback() {
    await super.initCallback();
    await this._findDeveloperKey();
    await this._updateDeviceList();
    // Update devices once every half an hour
    this._deviceListTimer = setInterval(
      () => void this._updateDeviceList(),
      30 * 60 * 1000,
    );
  }

  async destroyCallback() {
    await super.destroyCallback();
    this.devApi?.destroy();
    clearInterval(this._deviceListTimer);
  }

  /**
   * Adds a child that isn't a sub-device (e.g. the light).
   *
   * @param child The child
   */
  addExtraChild(child: MiioThing) {
    if (!child.id) throw new Error("Child needs to have an `id`");
    this.extraChildren.push(child as MiioThing & { id: string });
  }

  async _updateDeviceList() {
    const list = (await this.call("get_device_prop", [
      "lumi.0",
      "device_list",
    ])) as unknown[];
    const defs: ChildDefinition[] = [...this.extraChildren];
    for (let i = 0; i < list.length; i += 5) {
      const id = stripLumiFromId(String(list[i]));
      // Sanity check, skip gateway if found
      if (id === "0") continue;

      defs.push({
        id: "miio:" + id,
        type: String(list[i + 1]),
        online: list[i + 2] === 1,
      });
    }

    return this.syncer.update(defs);
  }

  /**
   * Either resolve the developer key or setup a new one.
   */
  async _findDeveloperKey() {
    // We already have a developer key
    if (this._developerKey) return this._developerKey;

    // Fetch the key, or set a new one
    const result = (await this.call("get_lumi_dpf_aes_key", [])) as string[];
    let key = result[0];
    if (!key || key.length !== 16) {
      key = generateKey();
      await this.call("set_lumi_dpf_aes_key", [key]);
    }
    await this._setDeveloperKey(key);
    return key;
  }

  /**
   * Set the developer key and start listening for events from the gateway.
   *
   * @param key The developer key
   */
  _setDeveloperKey(key: string): Promise<void> {
    this._developerKey = key;

    // If we are already connected to the Developer API skip init
    if (this.devApi) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const devApi = new DeveloperApi(this, this.management.address);
      this.devApi = devApi;

      devApi.on(
        "propertiesChanged",
        (e: { id: string; data: Record<string, unknown> }) => {
          if (e.id === "0") {
            // Data for the local gateway
            this._report(e.data);
          }
        },
      );
      const timer = setTimeout(reject, 10000);
      devApi.on("ready", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * Start the process of adding a device. Allows Zigbee devices to join for
   * 30 seconds.
   */
  async addDevice() {
    MiioApi.checkOk(await this.call("start_zigbee_join", [30]));
    setTimeout(() => void this._updateDeviceList(), 30000);
  }

  /**
   * Stop allowing devices to join.
   */
  async stopAddDevice() {
    MiioApi.checkOk(await this.call("start_zigbee_join", [0]));
  }

  /**
   * Remove a device from the gateway using the identifier of the device.
   *
   * @param id The device id
   */
  async removeDevice(id: string) {
    MiioApi.checkOk(await this.call("remove_device", [id]));
    await this._updateDeviceList();
  }
}

/** A gateway with a light (a child) and an illuminance sensor */
export class GatewayWithLightAndSensor extends compose(
  GatewayBasic,
  Illuminance,
) {
  async initCallback() {
    // Added before the device list is synchronized
    this.addExtraChild(new GatewayLight(this));
    await super.initCallback();
  }
}
