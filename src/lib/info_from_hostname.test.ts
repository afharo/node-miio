import { describe, test, expect } from "vitest";

import { infoFromHostname } from "./info_from_hostname.js";

describe("infoFromHostname", () => {
  test("extracts model and id from the miio hostname", () => {
    expect(infoFromHostname("zhimi-airpurifier-m1_miio12345")).toStrictEqual({
      model: "zhimi.airpurifier.m1",
      id: "12345",
    });
  });

  test("falls back to the rockrobo vacuum", () => {
    expect(infoFromHostname("rockrobo")).toStrictEqual({
      model: "rockrobo.vacuum.v1",
      type: "vacuum",
    });
  });

  test("returns null for unknown hostnames", () => {
    expect(infoFromHostname("my-laptop.local")).toBeNull();
  });
});
