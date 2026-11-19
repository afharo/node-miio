import p2008 from "../__fixtures__/miot/dreame.vacuum.p2008.json";

import { type MiotSpec, MiotSpecIndex, parseUrn } from "./miot_spec";

describe("parseUrn", () => {
  test("parses standard URNs", () => {
    expect(
      parseUrn(
        "urn:miot-spec-v2:property:battery-level:00000014:dreame-p2008:1",
      ),
    ).toEqual({
      namespace: "miot-spec-v2",
      kind: "property",
      name: "battery-level",
    });
  });

  test("parses vendor URNs", () => {
    expect(
      parseUrn("urn:dreame-spec:service:vacuum-extend:00007801:dreame-p2008:1"),
    ).toEqual({
      namespace: "dreame-spec",
      kind: "service",
      name: "vacuum-extend",
    });
  });

  test("tolerates malformed URNs", () => {
    expect(parseUrn("nope")).toEqual({ namespace: "", kind: "", name: "" });
  });
});

describe("MiotSpecIndex", () => {
  const index = new MiotSpecIndex(p2008 as MiotSpec);

  test("finds standard properties", () => {
    expect(index.property("vacuum", "status")).toMatchObject({
      siid: 2,
      piid: 1,
    });
    expect(index.property("battery", "battery-level")).toMatchObject({
      siid: 3,
      piid: 1,
    });
  });

  test("finds standard actions", () => {
    expect(index.action("vacuum", "start-sweep")).toMatchObject({
      siid: 2,
      aiid: 1,
    });
    expect(index.action("battery", "start-charge")).toMatchObject({
      siid: 3,
      aiid: 1,
    });
  });

  test("ignores vendor-specific definitions with the same names", () => {
    // `vacuum-extend:cleaning-time` exists in the vendor namespace only
    expect(index.property("vacuum-extend", "cleaning-time")).toBeUndefined();
    expect(index.property("vacuum", "cleaning-time")).toBeUndefined();
  });

  test("returns every service with the same name", () => {
    expect(index.services("brush-cleaner").map((s) => s.iid)).toEqual([9, 10]);
  });

  test("returns undefined for unknown names", () => {
    expect(index.property("vacuum", "nope")).toBeUndefined();
    expect(index.action("nope", "start-sweep")).toBeUndefined();
  });
});
