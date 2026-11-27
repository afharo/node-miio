import crypto from "node:crypto";

import { describe, test, expect } from "vitest";

import { hawkAuthorization, type RoborockRriot } from "./hawk";

const rriot: RoborockRriot = {
  u: "user-u",
  s: "sess-s",
  h: "hmac-key-h",
  k: "mqtt-k",
  r: {
    r: "EU",
    a: "https://api-eu.roborock.com",
    m: "ssl://mqtt-eu.roborock.com:8883",
  },
};
const md5 = (v: string) => crypto.createHash("md5").update(v).digest("hex");

describe("hawkAuthorization", () => {
  test("signs u:s:nonce:ts:md5(path) with HMAC-SHA256(h), empty params", () => {
    const header = hawkAuthorization(rriot, "/v3/user/homes/123", {
      timestamp: 1700000000,
      nonce: "abcDEF12",
    });
    const mac = crypto
      .createHmac("sha256", "hmac-key-h")
      .update(
        `user-u:sess-s:abcDEF12:1700000000:${md5("/v3/user/homes/123")}::`,
      )
      .digest("base64");
    expect(header).toBe(
      `Hawk id="user-u",s="sess-s",ts="1700000000",nonce="abcDEF12",mac="${mac}"`,
    );
  });

  test("hashes the params sorted by key", () => {
    const header = hawkAuthorization(rriot, "/user/devices/newadd", {
      timestamp: 1700000000,
      nonce: "n",
      params: { t: "2", s: "1" },
    });
    const mac = crypto
      .createHmac("sha256", "hmac-key-h")
      .update(
        `user-u:sess-s:n:1700000000:${md5("/user/devices/newadd")}:${md5("s=1&t=2")}:`,
      )
      .digest("base64");
    expect(header).toContain(`mac="${mac}"`);
  });

  test("uses a fresh nonce and the current time by default", () => {
    const a = hawkAuthorization(rriot, "/x");
    const b = hawkAuthorization(rriot, "/x");
    expect(a).not.toBe(b);
    const ts = Number(/ts="(\d+)"/.exec(a)?.[1]);
    expect(Math.abs(ts - Date.now() / 1000)).toBeLessThan(5);
  });
});
