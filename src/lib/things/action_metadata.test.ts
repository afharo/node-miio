import fs from "node:fs";
import path from "node:path";

import { describe, test, expect, vi } from "vitest";

import { Capability } from "./capability";
import { compose } from "./compose";
import { MiioThing, thingActions } from "./thing";

vi.mock("debug", () => ({ default: vi.fn(() => vi.fn()) }));

/** Methods that are internal by convention (the capabilities' rules, see `capability.ts`) */
const INTERNAL =
  /^(_|update|change|activate|deactivate|capability|emit|init|destroy|run)|^(constructor|propertyUpdated|setProperty|setRawProperty|defineProperty|getState|setState|removeState|loadProperties|poll|internalPoll|debug)$/;

/** Public methods that aren't actions */
const NOT_ACTIONS = new Set([
  // Private in TypeScript
  "activePreset",
  "defineMiotProperty",
  "caller",
  "request",
  "modes",
  "reportAction",
  "gatewayPropertyUpdated",
  // Managed by node-miio, or take a function
  "addChild",
  "removeChild",
  "findChild",
  "addExtraChild",
  // Needs a Xiaomi Cloud client (see `node-miio cloud map`)
  "getCloudMap",
]);

/** Methods a class has (for the shared vacuum API) but doesn't support: they reject, or return nothing */
const UNSUPPORTED: Record<string, string[]> = {
  DreameVacuum: ["cleanRooms", "resumeCleanRooms", "getRoomMap", "getTimer"],
  MiotVacuum: ["cleanRooms", "resumeCleanRooms", "getRoomMap", "getTimer"],
};

/** Every module of the library (like `modules_load.test.ts`) */
function listModules(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name.startsWith("__") ? [] : listModules(fullPath);
    }
    return /\.(js|ts)$/.test(entry.name) &&
      !/\.(test|test\.mock|d)\.ts$/.test(entry.name)
      ? [fullPath]
      : [];
  });
}

type ThingClass = abstract new (...args: never[]) => MiioThing;

/** The thing classes the modules export, and a thing for each capability */
async function thingClasses(): Promise<[string, ThingClass][]> {
  const found = new Map<ThingClass, string>();
  for (const modulePath of listModules(path.join(__dirname, ".."))) {
    const exports = (await import(modulePath)) as Record<string, unknown>;
    for (const [name, value] of Object.entries(exports)) {
      if (typeof value !== "function" || found.has(value as ThingClass)) {
        continue;
      }
      const label = `${path.basename(modulePath)} ${name}`;
      if (value.prototype instanceof MiioThing) {
        found.set(value as ThingClass, label);
      } else if (value.prototype instanceof Capability) {
        // Capabilities aren't things: compose one to check it
        found.set(
          compose(MiioThing, value as typeof Capability) as ThingClass,
          label,
        );
      }
    }
  }
  return Array.from(found, ([cls, label]) => [label, cls]);
}

/**
 * The public methods of a thing class (not getters), up to `MiioThing`
 *
 * @param cls The class
 * @returns Their names
 */
function publicMethods(cls: ThingClass): string[] {
  const names = new Set<string>();
  for (let c = cls; c && c !== MiioThing; c = Object.getPrototypeOf(c)) {
    for (const key of Reflect.ownKeys(c.prototype)) {
      if (typeof key !== "string" || INTERNAL.test(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(c.prototype, key);
      if (typeof descriptor?.value === "function") names.add(key);
    }
  }
  const unsupported = new Set(UNSUPPORTED[cls.name] ?? []);
  return [...names]
    .filter((name) => !NOT_ACTIONS.has(name) && !unsupported.has(name))
    .sort();
}

describe("actions", async () => {
  const classes = await thingClasses();

  test("finds the thing classes", () => {
    const labels = classes.map(([label]) => label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "vacuum.ts Vacuum",
        "miot-vacuum.ts MiotVacuum",
        "power.ts SwitchablePower",
        "gateway.ts GatewayBasic",
      ]),
    );
  });

  test.each(classes)(
    "%s declares every public method as an action",
    (_label, cls) => {
      expect(Object.keys(thingActions(cls)).sort()).toEqual(
        expect.arrayContaining(publicMethods(cls)),
      );
    },
  );

  test.each(classes)("%s declares only methods it has", (_label, cls) => {
    for (const name of Object.keys(thingActions(cls))) {
      expect([name, name in cls.prototype]).toEqual([name, true]);
    }
  });

  test("an overriding class redefines the action and adds its tag", () => {
    class Base extends Capability {
      static capability = "base";
      static actions = [{ name: "go", description: "Base" }];
      go() {}
    }
    class Better extends Base {
      static capability = "better";
      static actions = [
        {
          name: "go",
          description: "Better",
          arguments: [{ type: "number", optional: true }],
        },
      ];
    }
    class Thing extends compose(MiioThing, Better) {
      static type = "thing";
      static actions = [{ name: "stay", returns: "boolean" }];
      stay() {
        return true;
      }
    }

    expect(thingActions(Thing)).toEqual({
      go: {
        name: "go",
        description: "Better",
        arguments: [{ type: "number", optional: true }],
        tags: ["cap:base", "cap:better"],
      },
      stay: {
        name: "stay",
        returns: "boolean",
        arguments: [],
        tags: ["type:thing"],
      },
    });
    expect(new Thing().metadata.actions).toBe(thingActions(Thing));
  });
});
