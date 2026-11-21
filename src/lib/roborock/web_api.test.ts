import crypto from "node:crypto";

import { fakeFetch, type FakeRequest } from "../cloud/cloud.test.mock";

import { RoborockAuthError, RoborockSessionExpiredError } from "./errors";
import { RoborockLogin, RoborockWebApi, type RoborockSession } from "./web_api";

/** @returns The request to this path (fails the test if none) */
function byPath(requests: FakeRequest[], pathname: string) {
  const request = requests.find((r) => r.url.pathname === pathname);
  if (!request) throw new Error(`No request to ${pathname}`);
  return request;
}

const EU = "euiot.roborock.com";
const US = "usiot.roborock.com";

const userData = {
  token: "user-token",
  rruid: "rr123",
  rriot: {
    u: "u1",
    s: "s1",
    h: "h1",
    k: "k1",
    r: {
      r: "EU",
      a: "https://api-eu.roborock.com",
      m: "ssl://mqtt-eu.roborock.com:8883",
    },
  },
};

const homeData = {
  id: 123,
  name: "My Home",
  products: [
    {
      id: "prod-a296",
      name: "Roborock Saros 20",
      model: "roborock.vacuum.a296",
    },
    { id: "prod-s5", name: "Roborock S5", model: "roborock.vacuum.s5" },
  ],
  devices: [
    {
      duid: "duid-1",
      name: "Saros",
      localKey: "localkey12345678",
      productId: "prod-a296",
      pv: "1.0",
      fv: "02.10.00",
      online: true,
    },
  ],
  receivedDevices: [
    {
      duid: "duid-2",
      name: "Friend's S5",
      localKey: "otherkey12345678",
      productId: "prod-s5",
      pv: "L01",
    },
  ],
  rooms: [{ id: 1, name: "Kitchen" }],
};

/** getUrlByEmail: not on the US server, on the EU one */
const urlByEmail = {
  [`POST ${US}/api/v1/getUrlByEmail`]: () => ({
    json: {
      code: 200,
      data: { url: `https://${US}`, country: null, countrycode: null },
    },
  }),
  [`POST ${EU}/api/v1/getUrlByEmail`]: () => ({
    json: {
      code: 200,
      data: { url: `https://${EU}`, country: "ES", countrycode: "34" },
    },
  }),
};

describe("RoborockLogin", () => {
  test("finds the account's region, requests a code and logs in with it (v4)", async () => {
    const { fetch, requests } = fakeFetch({
      ...urlByEmail,
      [`POST ${EU}/api/v4/email/code/send`]: () => ({ json: { code: 200 } }),
      [`POST ${EU}/api/v3/key/sign`]: () => ({
        json: { code: 200, data: { k: "signed-k" } },
      }),
      [`GET ${EU}/api/v3/app/agreement/latest`]: () => ({
        json: { code: 200, data: { majorVersion: 15, minorVersion: 2 } },
      }),
      [`POST ${EU}/api/v4/auth/email/login/code`]: () => ({
        json: { code: 200, data: userData },
      }),
    });

    const login = await RoborockLogin.start("me@example.com", { fetch });
    expect(login.baseUrl).toBe(`https://${EU}`);
    await login.requestCode();
    const session = await login.loginWithCode("123456");

    expect(session).toStrictEqual({
      email: "me@example.com",
      baseUrl: `https://${EU}`,
      clientId: expect.any(String),
      userData,
    });
    const send = byPath(requests, "/api/v4/email/code/send");
    expect(Object.fromEntries(send.form)).toStrictEqual({
      email: "me@example.com",
      type: "login",
      platform: "",
    });
    const expectedClientId = crypto
      .createHash("md5")
      .update("me@example.com")
      .update(session.clientId)
      .digest("base64");
    expect(send.headers.header_clientid).toBe(expectedClientId);

    const sign = byPath(requests, "/api/v3/key/sign");
    const loginRequest = byPath(requests, "/api/v4/auth/email/login/code");
    expect(loginRequest.headers["x-mercy-ks"]).toBe(
      sign.url.searchParams.get("s"),
    );
    expect(loginRequest.headers["x-mercy-ks"]).toHaveLength(16);
    expect(loginRequest.headers["x-mercy-k"]).toBe("signed-k");
    // Same client ID on every request of the login
    expect(loginRequest.headers.header_clientid).toBe(expectedClientId);
    expect(Object.fromEntries(loginRequest.form)).toStrictEqual({
      country: "ES",
      countryCode: "34",
      email: "me@example.com",
      code: "123456",
      majorVersion: "15",
      minorVersion: "2",
    });
  });

  test("falls back to the v1 endpoints when the account has no country", async () => {
    const { fetch, requests } = fakeFetch({
      [`POST ${US}/api/v1/getUrlByEmail`]: () => ({
        json: { code: 200, data: { url: `https://${US}`, country: "US" } },
      }),
      [`POST ${US}/api/v1/sendEmailCode`]: () => ({ json: { code: 200 } }),
      [`POST ${US}/api/v1/loginWithCode`]: () => ({
        json: { code: 200, data: userData },
      }),
    });
    const login = await RoborockLogin.start("me@example.com", { fetch });
    await login.requestCode();
    await login.loginWithCode("654321");
    const loginRequest = requests[requests.length - 1];
    expect(Object.fromEntries(loginRequest.url.searchParams)).toStrictEqual({
      username: "me@example.com",
      verifycode: "654321",
      verifycodetype: "AUTH_EMAIL_CODE",
    });
  });

  test("uses the default agreement version if it can't be fetched", async () => {
    let form: FakeRequest["form"] | undefined;
    const { fetch } = fakeFetch({
      ...urlByEmail,
      [`POST ${EU}/api/v3/key/sign`]: () => ({
        json: { code: 200, data: { k: "k" } },
      }),
      [`POST ${EU}/api/v4/auth/email/login/code`]: (request) => {
        form = request.form;
        return { json: { code: 200, data: userData } };
      },
    });
    const login = await RoborockLogin.start("me@example.com", { fetch });
    await login.loginWithCode("1");
    expect(form?.get("majorVersion")).toBe("14");
    expect(form?.get("minorVersion")).toBe("0");
  });

  test.each([
    [2018, "The code is not valid"],
    [3006, "Accept the user agreement in the Roborock app, then try again"],
    [3039, "This Roborock account doesn't exist in this region"],
  ])("login error %i", async (code, message) => {
    const { fetch } = fakeFetch({
      ...urlByEmail,
      [`POST ${EU}/api/v3/key/sign`]: () => ({
        json: { code: 200, data: { k: "k" } },
      }),
      [`POST ${EU}/api/v4/auth/email/login/code`]: () => ({
        json: { code, msg: "nope" },
      }),
    });
    const login = await RoborockLogin.start("me@example.com", { fetch });
    const error = await login.loginWithCode("1").catch((e) => e);
    expect(error).toBeInstanceOf(RoborockAuthError);
    expect(error.message).toBe(message);
    expect(error.code).toBe(code);
  });

  test("account not found on any region", async () => {
    const empty = () => ({
      json: { code: 200, data: { url: "x", country: null, countrycode: null } },
    });
    const { fetch, requests } = fakeFetch({
      [`POST ${US}/api/v1/getUrlByEmail`]: empty,
      [`POST ${EU}/api/v1/getUrlByEmail`]: empty,
      [`POST cniot.roborock.com/api/v1/getUrlByEmail`]: empty,
      [`POST ruiot.roborock.com/api/v1/getUrlByEmail`]: empty,
    });
    await expect(
      RoborockLogin.start("me@example.com", { fetch }),
    ).rejects.toThrow(
      "No Roborock account was found with this email on any region",
    );
    expect(requests).toHaveLength(4);
  });

  test("too many codes requested", async () => {
    const { fetch } = fakeFetch({
      ...urlByEmail,
      [`POST ${EU}/api/v4/email/code/send`]: () => ({
        json: { code: 9002, msg: "too frequent" },
      }),
    });
    const login = await RoborockLogin.start("me@example.com", { fetch });
    await expect(login.requestCode()).rejects.toThrow(
      "Too many codes requested: try again later",
    );
  });
});

describe("RoborockWebApi", () => {
  const session: RoborockSession = {
    email: "me@example.com",
    baseUrl: `https://${EU}`,
    clientId: "client-id",
    userData,
  };

  test("lists the robots (own and shared) with their models", async () => {
    const { fetch, requests } = fakeFetch({
      [`GET ${EU}/api/v1/getHomeDetail`]: () => ({
        json: { code: 200, data: { rrHomeId: 123 } },
      }),
      [`GET api-eu.roborock.com/v3/user/homes/123`]: () => ({
        json: { success: true, result: homeData },
      }),
    });
    const devices = await new RoborockWebApi(session, { fetch }).getDevices();

    expect(devices).toStrictEqual([
      {
        duid: "duid-1",
        name: "Saros",
        model: "roborock.vacuum.a296",
        productName: "Roborock Saros 20",
        protocolVersion: "1.0",
        firmwareVersion: "02.10.00",
        online: true,
        localKey: "localkey12345678",
        shared: false,
      },
      {
        duid: "duid-2",
        name: "Friend's S5",
        model: "roborock.vacuum.s5",
        productName: "Roborock S5",
        protocolVersion: "L01",
        firmwareVersion: undefined,
        online: undefined,
        localKey: "otherkey12345678",
        shared: true,
      },
    ]);
    expect(requests[0].headers.authorization).toBe("user-token");
    expect(requests[1].headers.authorization).toMatch(
      /^Hawk id="u1",s="s1",ts="\d+",nonce="[^"]+",mac="[^"]+"$/,
    );
  });

  test("an expired session", async () => {
    const { fetch } = fakeFetch({
      [`GET ${EU}/api/v1/getHomeDetail`]: () => ({
        json: { code: 2010, msg: "invalid token" },
      }),
    });
    await expect(
      new RoborockWebApi(session, { fetch }).getDevices(),
    ).rejects.toBeInstanceOf(RoborockSessionExpiredError);
  });

  test("a failed home data request", async () => {
    const { fetch } = fakeFetch({
      [`GET ${EU}/api/v1/getHomeDetail`]: () => ({
        json: { code: 200, data: { rrHomeId: 123 } },
      }),
      [`GET api-eu.roborock.com/v3/user/homes/123`]: () => ({
        json: { success: false, msg: "nope" },
      }),
    });
    await expect(
      new RoborockWebApi(session, { fetch }).getHomeData(),
    ).rejects.toThrow("Getting the home data failed: nope");
  });
});
