import crypto from "node:crypto";

import { describe, test, expect, vi } from "vitest";

import { fakeFetch, type Handler } from "./cloud.test.mock.js";
import {
  CloudAuthError,
  CloudCaptchaRequiredError,
  CloudTwoFactorRequiredError,
} from "./errors.js";
import { loginWithPassword, loginWithQrCode } from "./login.js";

vi.mock("debug", () => ({ default: vi.fn(() => vi.fn()) }));

const ACCOUNT = "account.xiaomi.com";
const SSECURITY = "c3NlY3VyaXR5LXZhbHVl";
const LOCATION = "https://sts.api.io.mi.com/sts?d=abc&nonce=1";
const json = (body: unknown) => `&&&START&&&${JSON.stringify(body)}`;

const step1: Handler = () => ({ text: json({ _sign: "the-sign" }) });
/** The STS redirects once, then sets the serviceToken cookie */
const sts: Record<string, Handler> = {
  [`GET sts.api.io.mi.com/sts`]: (req) =>
    req.url.searchParams.get("hop")
      ? {
          text: "ok",
          setCookies: [
            "serviceToken=the-token; Domain=.sts.api.io.mi.com; Path=/",
          ],
        }
      : { status: 302, headers: { location: `${LOCATION}&hop=1` } },
};

describe("loginWithPassword", () => {
  test("logs in (sign → credentials → service token)", async () => {
    const { fetch, requests } = fakeFetch({
      [`GET ${ACCOUNT}/pass/serviceLogin`]: step1,
      [`POST ${ACCOUNT}/pass/serviceLoginAuth2`]: () => ({
        text: json({
          ssecurity: SSECURITY,
          userId: 1234,
          location: LOCATION,
          code: 0,
        }),
      }),
      ...sts,
    });

    await expect(
      loginWithPassword("me@example.com", "secret", { fetch }),
    ).resolves.toStrictEqual({
      userId: "1234",
      ssecurity: SSECURITY,
      serviceToken: "the-token",
    });

    expect(requests[0].cookies).toMatchObject({
      userId: "me@example.com",
      sdkVersion: "accountsdk-18.8.15",
    });
    const auth = requests[1].url.searchParams;
    expect(auth.get("hash")).toBe(
      crypto.createHash("md5").update("secret").digest("hex").toUpperCase(),
    );
    expect(auth.get("_sign")).toBe("the-sign");
    expect(auth.get("user")).toBe("me@example.com");
    // The password itself is never sent
    expect(JSON.stringify(requests.map((r) => r.url.toString()))).not.toContain(
      "secret",
    );
  });

  test("wrong credentials", async () => {
    const { fetch } = fakeFetch({
      [`GET ${ACCOUNT}/pass/serviceLogin`]: step1,
      [`POST ${ACCOUNT}/pass/serviceLoginAuth2`]: () => ({
        text: json({ code: 70016 }),
      }),
    });
    await expect(
      loginWithPassword("me", "wrong", { fetch }),
    ).rejects.toBeInstanceOf(CloudAuthError);
  });

  describe("captcha", () => {
    const routes = (): Record<string, Handler> => ({
      [`GET ${ACCOUNT}/pass/serviceLogin`]: step1,
      [`POST ${ACCOUNT}/pass/serviceLoginAuth2`]: (req) =>
        req.url.searchParams.get("captCode") === "AbC12"
          ? {
              text: json({
                ssecurity: SSECURITY,
                userId: 1,
                location: LOCATION,
              }),
            }
          : req.url.searchParams.get("captCode")
            ? { text: json({ code: 87001 }) }
            : {
                text: json({
                  code: 87001,
                  captchaUrl: "/pass/getCode?icodeType=login",
                }),
              },
      [`GET ${ACCOUNT}/pass/getCode`]: () => ({ body: Buffer.from("PNG") }),
      ...sts,
    });

    test("without a callback: CloudCaptchaRequiredError", async () => {
      const { fetch } = fakeFetch(routes());
      const error = await loginWithPassword("me", "pw", { fetch }).catch(
        (e) => e,
      );
      expect(error).toBeInstanceOf(CloudCaptchaRequiredError);
      expect(error.captchaUrl).toBe(
        "https://account.xiaomi.com/pass/getCode?icodeType=login",
      );
    });

    test("solved: retries with the captcha code", async () => {
      const { fetch } = fakeFetch(routes());
      const solveCaptcha = vi.fn().mockResolvedValue("AbC12");
      await expect(
        loginWithPassword("me", "pw", { fetch, solveCaptcha }),
      ).resolves.toMatchObject({
        serviceToken: "the-token",
      });
      expect(solveCaptcha).toHaveBeenCalledWith(
        Buffer.from("PNG"),
        expect.any(String),
      );
    });

    test("wrong captcha", async () => {
      const { fetch } = fakeFetch(routes());
      await expect(
        loginWithPassword("me", "pw", {
          fetch,
          solveCaptcha: async () => "nope",
        }),
      ).rejects.toThrow("Invalid captcha");
    });
  });

  describe("email verification (2FA)", () => {
    const notificationUrl = `https://${ACCOUNT}/fe/service/identity/authStart?sid=xiaomiio&context=ctx-1`;
    const routes = (): Record<string, Handler> => ({
      [`GET ${ACCOUNT}/pass/serviceLogin`]: step1,
      [`POST ${ACCOUNT}/pass/serviceLoginAuth2`]: () => ({
        text: json({ code: 0, userId: 42, notificationUrl }),
      }),
      [`GET ${ACCOUNT}/fe/service/identity/authStart`]: () => ({
        text: "<html/>",
        setCookies: ["ick=the-ick; Domain=.account.xiaomi.com"],
      }),
      [`GET ${ACCOUNT}/identity/list`]: () => ({ text: json({ code: 0 }) }),
      [`POST ${ACCOUNT}/identity/auth/sendEmailTicket`]: () => ({
        text: json({ code: 0 }),
      }),
      [`POST ${ACCOUNT}/identity/auth/verifyEmail`]: (req) =>
        req.form.get("ticket") === "123456"
          ? {
              text: json({
                code: 0,
                location: `https://${ACCOUNT}/identity/result/check?sid=xiaomiio&context=ctx-1`,
              }),
            }
          : { status: 403, text: "bad code" },
      [`GET ${ACCOUNT}/identity/result/check`]: () => ({
        status: 302,
        headers: {
          location: `https://${ACCOUNT}/pass/serviceLoginAuth2/end?x=1`,
        },
      }),
      [`GET ${ACCOUNT}/pass/serviceLoginAuth2/end`]: () => ({
        status: 302,
        headers: {
          location: LOCATION,
          "extension-pragma": JSON.stringify({
            ssecurity: SSECURITY,
            psecurity: "p",
          }),
        },
      }),
      ...sts,
    });

    test("without a callback: CloudTwoFactorRequiredError", async () => {
      const { fetch } = fakeFetch(routes());
      const error = await loginWithPassword("me", "pw", { fetch }).catch(
        (e) => e,
      );
      expect(error).toBeInstanceOf(CloudTwoFactorRequiredError);
      expect(error.notificationUrl).toBe(notificationUrl);
    });

    test("verifies the emailed code and completes the login", async () => {
      const { fetch, requests } = fakeFetch(routes());
      const getVerificationCode = vi.fn().mockResolvedValue(" 123456 ");
      await expect(
        loginWithPassword("me", "pw", { fetch, getVerificationCode }),
      ).resolves.toStrictEqual({
        userId: "42",
        ssecurity: SSECURITY,
        serviceToken: "the-token",
      });

      const verify = requests.find(
        (r) => r.url.pathname === "/identity/auth/verifyEmail",
      );
      expect(verify?.form.get("ick")).toBe("the-ick");
      expect(verify?.url.searchParams.get("context")).toBe("ctx-1");
    });

    test("wrong code", async () => {
      const { fetch } = fakeFetch(routes());
      await expect(
        loginWithPassword("me", "pw", {
          fetch,
          getVerificationCode: async () => "000000",
        }),
      ).rejects.toBeInstanceOf(CloudAuthError);
    });
  });
});

describe("loginWithQrCode", () => {
  test("shows the QR code and waits until it's scanned", async () => {
    let polls = 0;
    const { fetch } = fakeFetch({
      [`GET ${ACCOUNT}/longPolling/loginUrl`]: () => ({
        text: json({
          qr: "https://account.xiaomi.com/qr.png",
          loginUrl: "https://account.xiaomi.com/login?qr=1",
          lp: "https://lp.account.xiaomi.com/lp/poll",
          timeout: 300,
        }),
      }),
      [`GET lp.account.xiaomi.com/lp/poll`]: () =>
        ++polls < 2
          ? { status: 200, text: json({ code: 0 }) } // not scanned yet (no ssecurity)
          : {
              text: json({
                userId: 7,
                ssecurity: SSECURITY,
                location: LOCATION,
              }),
            },
      ...sts,
    });
    const onQrCode = vi.fn();

    // The first poll answers without ssecurity: it keeps polling
    await expect(
      loginWithQrCode({ fetch, onQrCode, retryDelayMs: 1 }),
    ).resolves.toStrictEqual({
      userId: "7",
      ssecurity: SSECURITY,
      serviceToken: "the-token",
    });
    expect(onQrCode).toHaveBeenCalledWith({
      imageUrl: "https://account.xiaomi.com/qr.png",
      loginUrl: "https://account.xiaomi.com/login?qr=1",
      timeoutMs: 300_000,
    });
  });
});
