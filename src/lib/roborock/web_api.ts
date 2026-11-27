/**
 * The Roborock account API: what the Roborock app uses to log in and list the robots of the account.
 *
 * Robots paired with the Roborock app don't use the Xiaomi Cloud or miIO tokens. Instead, the account's home data
 * gives each robot's `duid` and `localKey`, which encrypt the local (TCP 58867) and MQTT connections.
 *
 * The endpoints and their parameters follow python-roborock (Apache-2.0, https://github.com/Python-roborock/python-roborock),
 * `roborock/web_api/`. No code is copied from it.
 */
import crypto from "node:crypto";

import { createDebug } from "../logger";
import type { FetchLike } from "../cloud/http";

import {
  RoborockApiError,
  RoborockAuthError,
  RoborockSessionExpiredError,
} from "./errors";
import { hawkAuthorization, type RoborockRriot } from "./hawk";

const debug = createDebug("miio:roborock");

/** The regional servers that know where an account lives (`getUrlByEmail`) */
export const ROBOROCK_BASE_URLS = [
  "https://usiot.roborock.com",
  "https://euiot.roborock.com",
  "https://cniot.roborock.com",
  "https://ruiot.roborock.com",
];

/** The user data returned by the login */
export interface RoborockUserData {
  /** Authorizes the requests to the regional server */
  token: string;
  rruid?: string;
  rriot: RoborockRriot;
  [key: string]: unknown;
}

/** What's needed to use the account without logging in again. As sensitive as a password: keep it private. */
export interface RoborockSession {
  email: string;
  /** The regional server of the account (e.g. `https://euiot.roborock.com`) */
  baseUrl: string;
  /** Random ID of this client, sent (hashed) with every request */
  clientId: string;
  userData: RoborockUserData;
}

export interface RoborockProduct {
  id: string;
  name: string;
  /** The same model IDs as Mi Home, e.g. `roborock.vacuum.a15` */
  model: string;
  category?: string;
  [key: string]: unknown;
}

export interface RoborockHomeDevice {
  duid: string;
  name: string;
  /** Encrypts the local and MQTT messages of this robot */
  localKey: string;
  productId: string;
  /** Protocol version: `1.0` and `L01` carry the same commands as miIO; `A01`/`B01` are different command sets */
  pv: string;
  fv?: string;
  online?: boolean;
  sn?: string;
  [key: string]: unknown;
}

export interface RoborockHomeData {
  id: number;
  name: string;
  products: RoborockProduct[];
  devices: RoborockHomeDevice[];
  /** Robots shared with this account by other accounts */
  receivedDevices: RoborockHomeDevice[];
  rooms: { id: number; name: string }[];
  [key: string]: unknown;
}

/** A robot of the account, with its product details */
/** A routine of the Roborock app (see {@link RoborockWebApi.getRoutines}) */
export interface RoborockRoutine {
  id: number;
  name: string;
  enabled: boolean;
}

export interface RoborockDevice {
  duid: string;
  name: string;
  model?: string;
  productName?: string;
  protocolVersion: string;
  firmwareVersion?: string;
  online?: boolean;
  localKey: string;
  /** Shared with this account by another account */
  shared: boolean;
}

export interface RoborockWebApiOptions {
  /** Injectable `fetch` (tests) */
  fetch?: FetchLike;
  /** Request timeout in milliseconds (default 15s) */
  timeoutMs?: number;
}

interface ApiResponse<T> {
  code?: number;
  msg?: string;
  data?: T;
  success?: boolean;
  result?: T;
}

interface RequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, string>;
  form?: Record<string, string>;
  headers?: Record<string, string>;
}

class Requester {
  constructor(private readonly options: RoborockWebApiOptions) {}

  async json<T>(
    url: string,
    { method = "POST", query, form, headers = {} }: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const target = new URL(url);
    for (const [key, value] of Object.entries(query ?? {})) {
      target.searchParams.set(key, value);
    }
    const fetchImpl = this.options.fetch ?? fetch;
    const response = await fetchImpl(target.toString(), {
      method,
      headers: form
        ? { ...headers, "Content-Type": "application/x-www-form-urlencoded" }
        : headers,
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
    });
    const text = await response.text();
    try {
      return JSON.parse(text) as ApiResponse<T>;
    } catch {
      throw new RoborockApiError(
        `Unexpected response from ${target.host}${target.pathname} (HTTP ${response.status})`,
        response.status,
      );
    }
  }
}

/**
 * @param session The session (or the login in progress)
 * @param session.email The email of the account
 * @param session.clientId The random ID of this client
 * @returns The `header_clientid` header: base64(md5(email + clientId))
 */
function clientIdHeader({
  email,
  clientId,
}: {
  email: string;
  clientId: string;
}) {
  return crypto
    .createHash("md5")
    .update(email)
    .update(clientId)
    .digest("base64");
}

/**
 * @param response The API response
 * @param what What was requested (for the error message)
 * @returns The response's data
 */
function expectOk<T>(response: ApiResponse<T>, what: string): T {
  if (response.code === 200 && response.data !== undefined) {
    return response.data;
  }
  throw new RoborockApiError(
    `${what} failed: ${response.msg ?? "unknown error"} (code ${response.code})`,
    response.code,
  );
}

/**
 * Logs in to a Roborock account with a code sent by email (the Roborock app's default login).
 *
 * ```ts
 * const login = await RoborockLogin.start("me@example.com");
 * await login.requestCode();
 * const session = await login.loginWithCode(code);
 * ```
 */
export class RoborockLogin {
  private constructor(
    private readonly http: Requester,
    readonly email: string,
    /** The regional server of the account */
    readonly baseUrl: string,
    readonly country: string | undefined,
    readonly countryCode: string | undefined,
    private readonly clientId: string,
  ) {}

  /**
   * Finds the regional server of the account.
   *
   * @param email The email of the Roborock account
   * @param options The options
   * @returns The login
   */
  static async start(email: string, options: RoborockWebApiOptions = {}) {
    const http = new Requester(options);
    for (const baseUrl of ROBOROCK_BASE_URLS) {
      const response = await http.json<{
        url: string;
        country?: string;
        countrycode?: string | number;
      }>(`${baseUrl}/api/v1/getUrlByEmail`, {
        query: { email, needtwostepauth: "false" },
      });
      if (response.code === 2003) {
        throw new RoborockAuthError("The email is not valid", response.code);
      }
      const data = expectOk(response, "Finding the account's server");
      if (data.country || data.countrycode) {
        debug(`Account found on ${data.url} (country ${data.country})`);
        return new RoborockLogin(
          http,
          email,
          data.url,
          data.country,
          data.countrycode === undefined ? undefined : String(data.countrycode),
          crypto.randomBytes(16).toString("base64url"),
        );
      }
    }
    throw new RoborockAuthError(
      "No Roborock account was found with this email on any region",
    );
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      header_clientid: clientIdHeader({
        email: this.email,
        clientId: this.clientId,
      }),
      header_clientlang: "en",
      ...extra,
    };
  }

  /**
   * Asks Roborock to email a verification code.
   */
  async requestCode() {
    const response =
      this.country && this.countryCode
        ? await this.http.json(`${this.baseUrl}/api/v4/email/code/send`, {
            form: { email: this.email, type: "login", platform: "" },
            headers: this.headers(),
          })
        : await this.http.json(`${this.baseUrl}/api/v1/sendEmailCode`, {
            query: { username: this.email, type: "auth" },
            headers: this.headers(),
          });
    if (response.code === 200) return;
    if (response.code === 2008) {
      throw new RoborockAuthError(
        "This Roborock account doesn't exist",
        response.code,
      );
    }
    if (response.code === 9002) {
      throw new RoborockAuthError(
        "Too many codes requested: try again later",
        response.code,
      );
    }
    throw new RoborockApiError(
      `Requesting the code failed: ${response.msg} (code ${response.code})`,
      response.code,
    );
  }

  /**
   * @param code The code from the email
   * @returns The session
   */
  async loginWithCode(code: string): Promise<RoborockSession> {
    const response =
      this.country && this.countryCode
        ? await this.loginV4(code, this.country, this.countryCode)
        : await this.http.json<RoborockUserData>(
            `${this.baseUrl}/api/v1/loginWithCode`,
            {
              query: {
                username: this.email,
                verifycode: code,
                verifycodetype: "AUTH_EMAIL_CODE",
              },
              headers: this.headers(),
            },
          );
    switch (response.code) {
      case 2018:
        throw new RoborockAuthError("The code is not valid", response.code);
      case 3009:
      case 3006:
        throw new RoborockAuthError(
          "Accept the user agreement in the Roborock app, then try again",
          response.code,
        );
      case 3039:
        throw new RoborockAuthError(
          "This Roborock account doesn't exist in this region",
          response.code,
        );
    }
    const userData = expectOk(response, "Logging in");
    if (!userData?.token || !userData.rriot) {
      throw new RoborockApiError("The login response has no credentials");
    }
    return {
      email: this.email,
      baseUrl: this.baseUrl,
      clientId: this.clientId,
      userData,
    };
  }

  private async loginV4(code: string, country: string, countryCode: string) {
    // Sign a random string: the login needs it (x-mercy-ks / x-mercy-k)
    const ks = crypto
      .randomBytes(12)
      .toString("base64url")
      .replace(/[-_]/g, "a")
      .slice(0, 16);
    const signed = expectOk(
      await this.http.json<{ k: string }>(`${this.baseUrl}/api/v3/key/sign`, {
        query: { s: ks },
        headers: this.headers(),
      }),
      "Signing the login",
    );
    const agreement = await this.agreementVersion(country);
    return this.http.json<RoborockUserData>(
      `${this.baseUrl}/api/v4/auth/email/login/code`,
      {
        form: {
          country,
          countryCode,
          email: this.email,
          code,
          majorVersion: String(agreement.majorVersion),
          minorVersion: String(agreement.minorVersion),
        },
        headers: this.headers({
          "x-mercy-ks": ks,
          "x-mercy-k": signed.k,
          header_appversion: "4.54.02",
          header_phonesystem: "iOS",
          header_phonemodel: "iPhone16,1",
        }),
      },
    );
  }

  /**
   * @param country The country of the account
   * @returns The current version of the user agreement: the login rejects an outdated one
   */
  private async agreementVersion(country: string) {
    try {
      const response = await this.http.json<{
        majorVersion?: number;
        minorVersion?: number;
      }>(`${this.baseUrl}/api/v3/app/agreement/latest`, {
        method: "GET",
        query: { country },
        headers: { header_clientlang: "en" },
      });
      const { majorVersion, minorVersion } = response.data ?? {};
      if (
        response.code === 200 &&
        typeof majorVersion === "number" &&
        typeof minorVersion === "number"
      ) {
        return { majorVersion, minorVersion };
      }
    } catch (err) {
      debug(`Couldn't get the user agreement version: ${err}`);
    }
    return { majorVersion: 14, minorVersion: 0 };
  }
}

/**
 * The account API, once logged in.
 */
export class RoborockWebApi {
  private readonly http: Requester;

  constructor(
    readonly session: RoborockSession,
    options: RoborockWebApiOptions = {},
  ) {
    this.http = new Requester(options);
  }

  /**
   * @returns The ID of the account's home
   */
  async getHomeId(): Promise<number> {
    const response = await this.http.json<{ rrHomeId: number }>(
      `${this.session.baseUrl}/api/v1/getHomeDetail`,
      {
        method: "GET",
        headers: {
          header_clientid: clientIdHeader(this.session),
          Authorization: this.session.userData.token,
        },
      },
    );
    if (response.code === 2010) throw new RoborockSessionExpiredError();
    return expectOk(response, "Getting the home").rrHomeId;
  }

  /**
   * @returns The home data: robots (with their local keys), products and rooms
   */
  async getHomeData(): Promise<RoborockHomeData> {
    const homeId = await this.getHomeId();
    const response = await this.rriotRequest<RoborockHomeData>(
      "GET",
      `/v3/user/homes/${homeId}`,
    );
    if (!response.success || !response.result) {
      throw new RoborockApiError(
        `Getting the home data failed: ${response.msg ?? JSON.stringify(response)}`,
        response.code,
      );
    }
    return {
      ...response.result,
      products: response.result.products ?? [],
      devices: response.result.devices ?? [],
      receivedDevices: response.result.receivedDevices ?? [],
      rooms: response.result.rooms ?? [],
    };
  }

  /**
   * The robot's routines in the Roborock app (they run in the Roborock cloud). Based on python-roborock's
   * `ScenesApi.get_scenes` (Apache-2.0).
   *
   * @param duid The robot
   * @returns Its routines
   */
  async getRoutines(duid: string): Promise<RoborockRoutine[]> {
    const response = await this.rriotRequest<
      Array<{ id: number; name?: string; enabled?: boolean }>
    >("GET", `/user/scene/device/${duid}`);
    if (!response.success || !Array.isArray(response.result)) {
      throw new RoborockApiError(
        `Getting the routines failed: ${response.msg ?? JSON.stringify(response)}`,
        response.code,
      );
    }
    return response.result.map(({ id, name, enabled }) => ({
      id,
      name: name ?? "",
      enabled: enabled !== false,
    }));
  }

  /**
   * Runs a routine, like tapping it in the Roborock app. Based on python-roborock's `ScenesApi.execute_scene`.
   *
   * @param id The routine's id, from {@link getRoutines}
   */
  async runRoutine(id: number) {
    const response = await this.rriotRequest<unknown>(
      "POST",
      `/user/scene/${id}/execute`,
    );
    if (!response.success) {
      throw new RoborockApiError(
        `Running the routine failed: ${response.msg ?? JSON.stringify(response)}`,
        response.code,
      );
    }
  }

  /**
   * A request to the IoT API, signed with the session's `rriot`.
   *
   * @param method The HTTP method
   * @param path The API path
   * @returns The response
   */
  private rriotRequest<T>(method: "GET" | "POST", path: string) {
    const { rriot } = this.session.userData;
    return this.http.json<T>(`${rriot.r.a.replace(/\/$/, "")}${path}`, {
      method,
      headers: { Authorization: hawkAuthorization(rriot, path) },
    });
  }

  /**
   * @returns The robots of the account (own and shared), with their models
   */
  async getDevices(): Promise<RoborockDevice[]> {
    return toDevices(await this.getHomeData());
  }
}

/**
 * @param home The home data
 * @returns The robots of the home (own and shared), with their product details
 */
export function toDevices(home: RoborockHomeData): RoborockDevice[] {
  const products = new Map(home.products.map((p) => [p.id, p]));
  const map = (device: RoborockHomeDevice, shared: boolean) => {
    const product = products.get(device.productId);
    return {
      duid: device.duid,
      name: device.name,
      model: product?.model,
      productName: product?.name,
      protocolVersion: device.pv,
      firmwareVersion: device.fv,
      online: device.online,
      localKey: device.localKey,
      shared,
    };
  };
  return [
    ...home.devices.map((d) => map(d, false)),
    ...home.receivedDevices.map((d) => map(d, true)),
  ];
}
