import { describe, test, expect, vi } from "vitest";

const discovery = vi.hoisted(() => ({
  Browser: vi.fn(function (this: { options: unknown }, options: unknown) {
    this.options = options;
  }),
  Devices: vi.fn(function (this: { options: unknown }, options: unknown) {
    this.options = options;
  }),
}));
vi.mock("./discovery.js", () => discovery);

import { browse, devices } from "./index.js";

describe("public API", () => {
  test("browse() creates a Browser with the options (or empty ones)", () => {
    expect(browse({ cacheTime: 5 })).toMatchObject({
      options: { cacheTime: 5 },
    });
    expect(browse()).toMatchObject({ options: {} });
  });

  test("devices() creates a Devices with the options (or empty ones)", () => {
    expect(devices({ cacheTime: 5 })).toMatchObject({
      options: { cacheTime: 5 },
    });
    expect(devices()).toMatchObject({ options: {} });
  });
});
