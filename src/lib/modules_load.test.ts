import fs from "node:fs";
import path from "node:path";

import * as miio from "./index";

jest.mock("debug", () => jest.fn().mockReturnValue(jest.fn()));

/**
 * Regression test: every module must be loadable on its own (no broken mixins, no circular imports evaluated too early).
 */
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

const modules = listModules(__dirname).map((p) => path.relative(__dirname, p));

describe("modules", () => {
  test.each(modules)("%s loads in isolation", (modulePath) => {
    jest.isolateModules(() => {
      expect(() =>
        jest.requireActual(path.join(__dirname, modulePath)),
      ).not.toThrow();
    });
  });

  test("the public API is exported", () => {
    expect(Object.keys(miio)).toEqual(
      expect.arrayContaining([
        "models",
        "device",
        "browse",
        "devices",
        "MiioDevice",
        "MiioError",
        "Vacuum",
        "MijiaVacuum",
        "ViomiVacuum",
        "DreameVacuum",
      ]),
    );
  });
});
