/*
 * Login flows of the Xiaomi account (password, with captcha and email verification, and QR code).
 *
 * Ported from Xiaomi-cloud-tokens-extractor (https://github.com/PiotrMachowski/Xiaomi-cloud-tokens-extractor)
 * Copyright (c) 2020 Piotr Machowski. Licensed under the MIT License.
 */
import crypto from "node:crypto";

import debugFactory from "debug";

import {
  CloudAuthError,
  CloudCaptchaRequiredError,
  CloudError,
  CloudTwoFactorRequiredError,
} from "./errors";
import { type FetchLike, HttpSession, parseXiaomiJson } from "./http";

const debug = debugFactory("miio:cloud");

const ACCOUNT = "https://account.xiaomi.com";
const STS_CALLBACK = "https://sts.api.io.mi.com/sts";
const LOGIN_QS = "%3Fsid%3Dxiaomiio%26_json%3Dtrue";
/** The credentials of a logged-in session. Persist it to avoid logging in again (it's as sensitive as a password) */
export interface CloudSession {
  userId: string;
  ssecurity: string;
  serviceToken: string;
}

export interface LoginOptions {
  /** The `fetch` implementation (defaults to the global one) */
  fetch?: FetchLike;
}

export interface PasswordLoginOptions extends LoginOptions {
  /**
   * Called when Xiaomi asks to solve a captcha: return the text shown in the image (case-sensitive).
   * Without it, a {@link CloudCaptchaRequiredError} is thrown.
   */
  solveCaptcha?: (image: Buffer, url: string) => Promise<string>;
  /**
   * Called after Xiaomi emails a verification code (2FA): return the code.
   * Without it, a {@link CloudTwoFactorRequiredError} is thrown.
   */
  getVerificationCode?: () => Promise<string>;
}

export interface QrCode {
  /** URL of the QR code image: scan it with the Mi Home app */
  imageUrl: string;
  /** URL of a page that shows the QR code */
  loginUrl: string;
  /** How long the QR code is valid for (ms) */
  timeoutMs: number;
}

export interface QrLoginOptions extends LoginOptions {
  /** Called with the QR code to show to the user */
  onQrCode: (qrCode: QrCode) => void | Promise<void>;
  /** Wait between long-polling attempts that didn't log in yet (default 2s) */
  retryDelayMs?: number;
}

/**
 * @returns A random user agent of the Mi Home app
 */
export function generateAgent(): string {
  const pick = (from: number, to: number, length: number) =>
    String.fromCharCode(
      ...Array.from({ length }, () => crypto.randomInt(from, to + 1)),
    );
  return `${pick(97, 122, 18)}-${pick(65, 69, 13)} APP/com.xiaomi.mihome APPV/10.5.201`;
}

/**
 * @param fetchImpl The `fetch` implementation
 * @returns A new HTTP session with the cookies and headers of the Mi Home app
 */
function newSession(fetchImpl?: FetchLike) {
  const http = new HttpSession(fetchImpl);
  const deviceId = String.fromCharCode(
    ...Array.from({ length: 6 }, () => crypto.randomInt(97, 123)),
  );
  for (const domain of ["mi.com", "xiaomi.com"]) {
    http.setCookie("sdkVersion", "accountsdk-18.8.15", domain);
    http.setCookie("deviceId", deviceId, domain);
  }
  return {
    http,
    headers: {
      "User-Agent": generateAgent(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
}

/**
 * Logs in with the Xiaomi account's username (email, phone number or user ID) and password.
 *
 * @param username The username
 * @param password The password (only its MD5 hash is sent, as the Mi Home app does)
 * @param options Callbacks for the captcha and the email verification
 * @returns The session
 */
export async function loginWithPassword(
  username: string,
  password: string,
  options: PasswordLoginOptions = {},
): Promise<CloudSession> {
  const { http, headers } = newSession(options.fetch);

  // Step 1: get the `_sign`
  const step1 = await http.request(
    `${ACCOUNT}/pass/serviceLogin?sid=xiaomiio&_json=true`,
    { headers, cookies: { userId: username } },
  );
  const step1Json = safeJson(step1.text);
  if (step1.status !== 200 || !step1Json) {
    throw new CloudAuthError(`Invalid username (HTTP ${step1.status})`);
  }
  let auth: Record<string, unknown>;
  if (typeof step1Json.ssecurity === "string") {
    // Already logged in
    auth = step1Json;
  } else if (typeof step1Json._sign === "string") {
    // Step 2: send the credentials
    const fields: Record<string, string> = {
      sid: "xiaomiio",
      // The Xiaomi login protocol expects the (uppercase) MD5 of the password, like the Mi Home app sends.
      // It's a wire format we don't choose, not a hash we store: the password and its hash are never persisted.
      hash: crypto
        .createHash("md5")
        .update(password)
        .digest("hex")
        .toUpperCase(),
      callback: STS_CALLBACK,
      qs: LOGIN_QS,
      user: username,
      _sign: step1Json._sign,
      _json: "true",
    };
    const loginAuth2 = () =>
      http.request(`${ACCOUNT}/pass/serviceLoginAuth2`, {
        method: "POST",
        headers,
        query: fields,
        followRedirects: false,
      });
    let step2 = await loginAuth2();
    let step2Json = step2.status === 200 ? safeJson(step2.text) : undefined;

    if (typeof step2Json?.captchaUrl === "string" && step2Json.captchaUrl) {
      const captchaUrl = new URL(step2Json.captchaUrl, ACCOUNT).toString();
      if (!options.solveCaptcha)
        throw new CloudCaptchaRequiredError(captchaUrl);
      const image = await http.request(captchaUrl, { headers });
      if (image.status !== 200) {
        throw new CloudError(
          `Unable to fetch the captcha (HTTP ${image.status})`,
        );
      }
      fields.captCode = await options.solveCaptcha(image.body, captchaUrl);
      step2 = await loginAuth2();
      step2Json = step2.status === 200 ? safeJson(step2.text) : undefined;
      if (step2Json?.code === 87001)
        throw new CloudAuthError("Invalid captcha");
    }

    if (!step2Json) {
      throw new CloudAuthError(`Login failed (HTTP ${step2.status})`);
    }
    if (isValidSsecurity(step2Json.ssecurity)) {
      auth = step2Json;
    } else if (typeof step2Json.notificationUrl === "string") {
      if (!options.getVerificationCode) {
        throw new CloudTwoFactorRequiredError(step2Json.notificationUrl);
      }
      return emailVerificationFlow(
        http,
        headers,
        step2Json.notificationUrl,
        options.getVerificationCode,
        step2Json.userId != null ? String(step2Json.userId) : undefined,
      );
    } else {
      debug(`serviceLoginAuth2 failed with code ${step2Json.code}`);
      throw new CloudAuthError("Invalid username or password");
    }
  } else {
    throw new CloudAuthError("Invalid username");
  }

  // Step 3: get the service token
  const location = stringOrUndefined(auth.location);
  if (!location) throw new CloudError("The login didn't return a location");
  const step3 = await http.request(location, { headers });
  const serviceToken = http.getCookie("serviceToken");
  if (step3.status !== 200 || !serviceToken) {
    throw new CloudError(
      `Unable to get the service token (HTTP ${step3.status})`,
    );
  }
  return {
    userId: String(auth.userId ?? http.getCookie("userId") ?? ""),
    ssecurity: auth.ssecurity as string,
    serviceToken,
  };
}

/**
 * The email-based two-factor authentication: Xiaomi emails a code, the user types it.
 *
 * @param http The HTTP session of the login
 * @param headers The headers of the login
 * @param notificationUrl The URL returned by the login
 * @param getVerificationCode The callback that asks the user for the code
 * @param userId The user ID, if known
 * @returns The session
 */
async function emailVerificationFlow(
  http: HttpSession,
  headers: Record<string, string>,
  notificationUrl: string,
  getVerificationCode: () => Promise<string>,
  userId?: string,
): Promise<CloudSession> {
  // 1) Open the notification URL (authStart)
  await http.request(notificationUrl, { headers });

  // 2) Fetch the identity options
  const context = new URL(notificationUrl).searchParams.get("context") ?? "";
  const common = { sid: "xiaomiio", context, _locale: "en_US" };
  await http.request(`${ACCOUNT}/identity/list`, { headers, query: common });

  // 3) Ask Xiaomi to email the code
  const ick = () => http.getCookie("ick") ?? "";
  await http.request(`${ACCOUNT}/identity/auth/sendEmailTicket`, {
    method: "POST",
    headers,
    query: { _dc: String(Date.now()), ...common, mask: "0" },
    form: { retry: "0", icode: "", _json: "true", ick: ick() },
  });

  // 4) Verify the code
  const code = (await getVerificationCode()).trim();
  const verify = await http.request(`${ACCOUNT}/identity/auth/verifyEmail`, {
    method: "POST",
    headers,
    query: { _flag: "8", _json: "true", ...common, mask: "0" },
    form: {
      _flag: "8",
      ticket: code,
      trust: "false",
      _json: "true",
      ick: ick(),
    },
  });
  if (verify.status !== 200) {
    throw new CloudAuthError(
      `Invalid verification code (HTTP ${verify.status})`,
    );
  }
  let finish =
    stringOrUndefined(safeJson(verify.text)?.location) ??
    verify.headers.get("location") ??
    verify.text.match(
      /https:\/\/account\.xiaomi\.com\/identity\/result\/check\?[^"']+/,
    )?.[0];

  if (!finish) {
    // Fallback: hit result/check directly
    const check = await http.request(`${ACCOUNT}/identity/result/check`, {
      headers,
      query: common,
      followRedirects: false,
    });
    finish = check.headers.get("location") ?? undefined;
  }
  if (!finish) throw new CloudError("Unable to complete the verification");
  finish = unescapeUrl(finish);

  // 5) result/check redirects to serviceLoginAuth2/end
  let endUrl: string | undefined = finish;
  if (finish.includes("identity/result/check")) {
    const check = await http.request(finish, {
      headers,
      followRedirects: false,
    });
    endUrl = check.headers.get("location") ?? undefined;
  }
  if (!endUrl)
    throw new CloudError("Unable to find the end of the verification");

  // 6) serviceLoginAuth2/end returns the ssecurity in the `extension-pragma` header
  let end = await http.request(endUrl, { headers, followRedirects: false });
  if (end.status === 200 && end.text.includes("Xiaomi Account - Tips")) {
    end = await http.request(endUrl, { headers, followRedirects: false });
  }
  let ssecurity: string | undefined;
  try {
    ssecurity = stringOrUndefined(
      JSON.parse(end.headers.get("extension-pragma") ?? "{}").ssecurity,
    );
  } catch (err) {
    debug(`Unable to parse extension-pragma: ${err}`);
  }
  if (!ssecurity)
    throw new CloudError("The verification didn't return the ssecurity");

  // 7) The STS redirect sets the serviceToken cookie
  let stsUrl = end.headers.get("location") ?? undefined;
  if (!stsUrl) {
    const start = end.text.indexOf(STS_CALLBACK);
    if (start !== -1) {
      const stop = end.text.indexOf('"', start);
      stsUrl = end.text.slice(start, stop === -1 ? start + 300 : stop);
    }
  }
  if (!stsUrl)
    throw new CloudError("The verification didn't return the STS URL");
  const sts = await http.request(unescapeUrl(stsUrl), { headers });
  const serviceToken = http.getCookie("serviceToken");
  if (sts.status !== 200 || !serviceToken) {
    throw new CloudError(
      `Unable to get the service token (HTTP ${sts.status})`,
    );
  }
  return {
    userId: userId ?? http.getCookie("userId") ?? "",
    ssecurity,
    serviceToken,
  };
}

/**
 * Logs in by scanning a QR code with the Mi Home app (no password needed).
 *
 * @param options The callback that shows the QR code
 * @returns The session
 */
export async function loginWithQrCode(
  options: QrLoginOptions,
): Promise<CloudSession> {
  const { http, headers } = newSession(options.fetch);

  // Step 1: get the QR code
  const step1 = await http.request(`${ACCOUNT}/longPolling/loginUrl`, {
    headers,
    query: {
      _qrsize: "480",
      qs: LOGIN_QS,
      callback: STS_CALLBACK,
      _hasLogo: "false",
      sid: "xiaomiio",
      serviceParam: "",
      _locale: "en_GB",
      _dc: String(Date.now()),
    },
  });
  const qr = step1.status === 200 ? safeJson(step1.text) : undefined;
  if (typeof qr?.qr !== "string" || typeof qr.lp !== "string") {
    throw new CloudError(
      `Unable to get the login QR code (HTTP ${step1.status})`,
    );
  }
  // The timeout is in seconds (values that look like milliseconds are accepted too)
  const timeout = Number(qr.timeout) || 300;
  const timeoutMs = timeout > 3600 ? timeout : timeout * 1000;
  await options.onQrCode({
    imageUrl: qr.qr,
    loginUrl: String(qr.loginUrl ?? qr.qr),
    timeoutMs,
  });

  // Step 2: long-poll until the QR code is scanned
  const deadline = Date.now() + timeoutMs;
  let auth: Record<string, unknown> | undefined;
  while (!auth && Date.now() < deadline) {
    try {
      const poll = await http.request(qr.lp, { headers, timeoutMs: 30_000 });
      const body = poll.status === 200 ? safeJson(poll.text) : undefined;
      if (isValidSsecurity(body?.ssecurity)) {
        auth = body;
      } else {
        await new Promise((resolve) =>
          setTimeout(resolve, options.retryDelayMs ?? 2000),
        );
      }
    } catch (err) {
      // Timeouts are expected: the server holds the request until the QR code is scanned
      debug(`Long polling: ${err}`);
    }
  }
  if (!auth || !isValidSsecurity(auth.ssecurity)) {
    throw new CloudAuthError("The QR code wasn't scanned in time");
  }
  const ssecurity = auth.ssecurity;

  // Step 3: get the service token
  const location = stringOrUndefined(auth.location);
  if (!location) throw new CloudError("The login didn't return a location");
  const step3 = await http.request(location, { headers });
  const serviceToken = http.getCookie("serviceToken");
  if (step3.status !== 200 || !serviceToken) {
    throw new CloudError(
      `Unable to get the service token (HTTP ${step3.status})`,
    );
  }
  return { userId: String(auth.userId), ssecurity, serviceToken };
}

/**
 * @param text A response body
 * @returns The parsed JSON object, or `undefined` if it isn't one
 */
function safeJson(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = parseXiaomiJson(text);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param value A value of the response
 * @returns Whether it's a valid `ssecurity`
 */
function isValidSsecurity(value: unknown): value is string {
  return typeof value === "string" && value.length > 4;
}

/**
 * @param value A value of the response
 * @returns The value, if it's a non-empty string
 */
function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/**
 * URLs embedded in JSON/HTML bodies may have escaped ampersands.
 *
 * @param url The URL
 * @returns The unescaped URL
 */
function unescapeUrl(url: string) {
  return url.replace(/\\u0026|&amp;/g, "&");
}
