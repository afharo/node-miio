import { styleText } from "node:util";

import type { CommandBuilder } from "yargs";

import { log } from "../log";
import deviceFinder from "../device-finder";
import type { ActionMetadata } from "../../lib/things/action_metadata";

/** How `inspect` groups the actions: by the first group with one of their tags */
const GROUPS = [
  { name: "Power", tags: ["cap:power", "cap:switchable-power"] },
  { name: "Mode", tags: ["cap:mode", "cap:switchable-mode"] },
  {
    name: "Cleaning",
    tags: [
      "cap:cleaning-state",
      "cap:autonomous-cleaning",
      "cap:spot-cleaning",
    ],
  },
  { name: "Fan speed", tags: ["cap:fan-speed", "cap:adjustable-fan-speed"] },
  {
    name: "Battery",
    tags: [
      "cap:battery-level",
      "cap:charging-state",
      "cap:autonomous-charging",
    ],
  },
  { name: "Vacuum", tags: ["type:miio:vacuum"] },
  {
    name: "Humidity",
    tags: ["cap:target-humidity", "cap:adjustable-target-humidity"],
  },
  {
    name: "Sensor",
    tags: [
      "type:sensor",
      "cap:temperature",
      "cap:relative-humidity",
      "cap:pm2.5",
      "cap:pm10",
      "cap:illuminance",
      "cap:atmospheric-pressure",
      "cap:power-load",
      "cap:power-consumed",
      "cap:voltage",
      "cap:contact",
      "cap:motion",
    ],
  },
  { name: "Brightness", tags: ["cap:brightness", "cap:dimmable"] },
  {
    name: "Color",
    tags: ["cap:colorable", "cap:color:temperature", "cap:color:full"],
  },
  { name: "Fading", tags: ["cap:fading"] },
  { name: "LED", tags: ["cap:miio:switchable-led", "cap:miio:led-brightness"] },
  { name: "Buzzer", tags: ["cap:miio:buzzer"] },
  { name: "Name", tags: ["cap:nameable"] },
  { name: "Children", tags: ["cap:children"] },
  { name: "Gateway", tags: ["type:miio:gateway"] },
  { name: "miIO", tags: ["type:miio"] },
];

export interface ActionGroup {
  name: string;
  /** The tags of the group the actions have */
  tags: string[];
  actions: ActionMetadata[];
}

/**
 * Groups the actions of a thing (see {@link GROUPS}). The rest go to "Other actions".
 *
 * @param actions The actions, by name (`metadata.actions`)
 * @returns The groups that have actions
 */
export function groupActions(
  actions: Readonly<Record<string, ActionMetadata>>,
): ActionGroup[] {
  const remaining = new Map(Object.entries(actions));
  const groups: ActionGroup[] = [];
  for (const group of GROUPS) {
    const tags = new Set<string>();
    const inGroup: ActionMetadata[] = [];
    for (const action of remaining.values()) {
      const tag = group.tags.find((t) => action.tags.includes(t));
      if (tag) {
        tags.add(tag);
        inGroup.push(action);
      }
    }
    if (inGroup.length === 0) continue;
    for (const action of inGroup) remaining.delete(action.name);
    groups.push({ name: group.name, tags: [...tags], actions: inGroup });
  }
  if (remaining.size > 0) {
    groups.push({
      name: "Other actions",
      tags: [],
      actions: [...remaining.values()],
    });
  }
  return groups;
}

/**
 * @param action An action
 * @returns How to call it, e.g. `setBrightness percentage [duration] [boolean]`
 */
export function actionUsage(action: ActionMetadata): string {
  return [
    action.name,
    ...action.arguments.map((arg) =>
      arg.optional ? `[${arg.type}]` : arg.type,
    ),
  ].join(" ");
}

export const command = "inspect <idOrIp>";
export const description = "Inspect a device";
export const builder: CommandBuilder = {
  token: {
    type: "string",
    description: "The known token of the device to communicate with",
  },
};

/**
 * Prints what the device reports about itself: model, token, firmware, Wi-Fi, properties, capabilities and the actions
 * it supports.
 *
 * @param argv The parsed command line
 * @param argv.idOrIp The device to inspect
 * @param argv.token The token, when it's not saved and the device hides it
 */
export function handler(argv: { idOrIp: string; token?: string }) {
  const target = argv.idOrIp;
  log.info("Attempting to inspect", target);

  let foundDevice = false;
  let pending = 0;
  const browser = deviceFinder({
    instances: true,
    filter: target,
    token: argv.token,
  });
  browser.on("available", async (device) => {
    pending++;
    foundDevice = true;

    const mgmt = device.management;
    try {
      const info = await mgmt.info();
      log.plain();
      log.device(device, true);

      if (!mgmt.parent) {
        log.plain(styleText("bold", "Firmware version:"), info.fw_ver);
        log.plain(styleText("bold", "Hardware version:"), info.hw_ver);
        if (info.mcu_fw_ver) {
          log.plain(
            styleText("bold", "MCU firmware version:"),
            info.mcu_fw_ver,
          );
        }
        log.plain();

        if (info.ap) {
          log.plain(
            styleText("bold", "WiFi:"),
            info.ap.ssid,
            styleText("dim", "(" + info.ap.bssid + ")"),
            styleText("bold", "RSSI:"),
            info.ap.rssi,
          );
        } else {
          log.plain(styleText("bold", "WiFi:"), "Not Connected");
        }
        if (info.wifi_fw_ver) {
          log.plain(
            styleText("bold", "WiFi firmware version:"),
            info.wifi_fw_ver,
          );
        }
        log.plain();

        let remoteAccess = "Maybe";
        if (info.ot === "otu") remoteAccess = "UDP";
        else if (info.ot === "ott") remoteAccess = "TCP";
        else if (info.ot) remoteAccess = `Unknown (${info.ot})`;
        log.plain(
          styleText("bold", "Remote access (Mi Home App):"),
          remoteAccess,
        );
        log.plain();
      }

      const props = device.properties;
      const keys = Object.keys(props);
      if (keys.length > 0) {
        log.plain(styleText("bold", "Properties:"));
        for (const key of keys) {
          log.plain("  -", key + ":", props[key]);
        }
        log.plain();
      }

      if (mgmt.parent) {
        log.plain(styleText("bold", "Parent:"));
        log.group(() => {
          log.device(mgmt.parent);
        });
      }

      printActions(device.metadata.actions ?? {});
    } catch (err) {
      process.exitCode = 1;
      log.error(
        "Could not inspect the device. Error was:",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      pending--;
      process.exit(); // eslint-disable-line n/no-process-exit
    }
  });

  const doneHandler = () => {
    if (pending === 0) {
      if (!foundDevice) {
        log.warn("Could not find device");
        process.exitCode = 1;
      }
      process.exit(); // eslint-disable-line n/no-process-exit
    }
  };
  setTimeout(doneHandler, 5000);
  browser.on("done", doneHandler);
}

/**
 * Prints the actions, grouped (they can be called with `node-miio control <device> <action> [args]`).
 *
 * @param actions The actions of the device, by name
 */
function printActions(actions: Readonly<Record<string, ActionMetadata>>) {
  const groups = groupActions(actions);
  if (groups.length === 0) return;

  log.plain(
    styleText("bold", "Actions:"),
    styleText("dim", "(node-miio control <device> <action> [args])"),
  );
  log.group(() => {
    for (const group of groups) {
      log.plain(
        styleText("bold", group.name),
        ...(group.tags.length > 0 ? ["-", group.tags.join(", ")] : []),
      );
      log.group(() => {
        for (const action of group.actions) {
          log.plain(
            actionUsage(action),
            ...(action.description
              ? [styleText("dim", `- ${action.description}`)]
              : []),
          );
        }
      });
      log.plain();
    }
  });
}
