/*
 * Client of the Xiaomi Cloud API (api.io.mi.com): homes, devices (with their tokens) and map files.
 *
 * Ported from Xiaomi-cloud-tokens-extractor (https://github.com/PiotrMachowski/Xiaomi-cloud-tokens-extractor)
 * and Xiaomi-Cloud-Map-Extractor (https://github.com/PiotrMachowski/Home-Assistant-custom-components-Xiaomi-Cloud-Map-Extractor)
 * Copyright (c) 2020 Piotr Machowski. Licensed under the MIT License.
 */
import debugFactory from "debug";

import {
  decryptRc4,
  encryptParams,
  generateNonce,
  signedNonce,
} from "./crypto";
import { CloudApiError, CloudError, CloudSessionExpiredError } from "./errors";
import { type FetchLike, HttpSession } from "./http";
import {
  type CloudSession,
  generateAgent,
  loginWithPassword,
  loginWithQrCode,
  type PasswordLoginOptions,
  type QrLoginOptions,
} from "./login";

const debug = debugFactory("miio:cloud");

/** The regional servers of the Xiaomi Cloud */
export const CLOUD_SERVERS = [
  "cn",
  "de",
  "us",
  "ru",
  "tw",
  "sg",
  "in",
  "i2",
] as const;
export type CloudServer = (typeof CLOUD_SERVERS)[number];

/** A device registered in the Xiaomi account */
export interface CloudDevice {
  /** The device ID */
  did: string;
  name: string;
  model: string;
  /** The token to control the device locally */
  token: string;
  /** The IP of the device in the local network, as last reported */
  localip?: string;
  mac?: string;
  isOnline?: boolean;
  /** The server the device is registered in */
  server: CloudServer;
  homeId: string;
  homeOwner: string;
}

interface Home {
  homeId: string;
  owner: string;
}

export interface XiaomiCloudOptions {
  /** The `fetch` implementation (defaults to the global one) */
  fetch?: FetchLike;
}

/**
 * Client of the Xiaomi Cloud API.
 *
 * ```ts
 * const cloud = await XiaomiCloud.loginWithQrCode({ onQrCode: ({ loginUrl }) => console.log(loginUrl) });
 * const devices = await cloud.getDevices();
 * ```
 */
export class XiaomiCloud {
  private readonly http: HttpSession;
  private readonly agent = generateAgent();

  /**
   * @param session A session from a previous login (see {@link XiaomiCloud.session})
   * @param options The client options
   */
  constructor(
    public readonly session: CloudSession,
    options: XiaomiCloudOptions = {},
  ) {
    this.http = new HttpSession(options.fetch);
  }

  /**
   * Logs in with a username (email, phone number or user ID) and password.
   *
   * @param username The username
   * @param password The password
   * @param options Callbacks for the captcha and the email verification
   * @returns The client
   */
  static async loginWithPassword(
    username: string,
    password: string,
    options: PasswordLoginOptions = {},
  ) {
    const session = await loginWithPassword(username, password, options);
    return new XiaomiCloud(session, options);
  }

  /**
   * Logs in by scanning a QR code with the Mi Home app.
   *
   * @param options The callback that shows the QR code
   * @returns The client
   */
  static async loginWithQrCode(options: QrLoginOptions) {
    const session = await loginWithQrCode(options);
    return new XiaomiCloud(session, options);
  }

  /**
   * @param server The regional server
   * @returns The base URL of the API in that server
   */
  static apiUrl(server: CloudServer | string) {
    return `https://${server === "cn" ? "" : `${server}.`}api.io.mi.com/app`;
  }

  /**
   * Calls the API (signed and encrypted).
   *
   * @param server The regional server
   * @param path The API path (e.g. `/v2/homeroom/gethome`)
   * @param data The request data
   * @returns The `result` of the response
   */
  async call<T = unknown>(
    server: CloudServer | string,
    path: string,
    data: unknown,
  ): Promise<T> {
    const url = XiaomiCloud.apiUrl(server) + path;
    const nonce = generateNonce();
    const key = signedNonce(this.session.ssecurity, nonce);
    const fields = encryptParams(
      url,
      "POST",
      key,
      nonce,
      { data: typeof data === "string" ? data : JSON.stringify(data) },
      this.session.ssecurity,
    );
    const response = await this.http.request(url, {
      method: "POST",
      query: fields,
      headers: {
        "Accept-Encoding": "identity",
        "User-Agent": this.agent,
        "Content-Type": "application/x-www-form-urlencoded",
        "x-xiaomi-protocal-flag-cli": "PROTOCAL-HTTP2",
        "MIOT-ENCRYPT-ALGORITHM": "ENCRYPT-RC4",
      },
      cookies: {
        userId: this.session.userId,
        yetAnotherServiceToken: this.session.serviceToken,
        serviceToken: this.session.serviceToken,
        locale: "en_GB",
        timezone: "GMT+02:00",
        is_daylight: "1",
        dst_offset: "3600000",
        channel: "MI_APP_STORE",
      },
    });
    if (response.status === 401) throw new CloudSessionExpiredError();
    if (response.status !== 200) {
      throw new CloudApiError(
        `${path} failed (HTTP ${response.status})`,
        response.status,
      );
    }

    let json: { code?: number; message?: string; result?: T };
    try {
      json = JSON.parse(decryptRc4(key, response.text));
    } catch {
      // Errors may come unencrypted
      try {
        json = JSON.parse(response.text);
      } catch {
        throw new CloudApiError(`${path} returned an unexpected response`);
      }
    }
    if (json.code !== undefined && json.code !== 0) {
      throw new CloudApiError(
        `${path} failed: ${json.message ?? json.code}`,
        json.code,
      );
    }
    return json.result as T;
  }

  /**
   * @param server The regional server
   * @returns The homes of the user and the homes shared with them
   */
  async getHomes(server: CloudServer | string): Promise<Home[]> {
    const homes: Home[] = [];
    const own = await this.call<{ homelist?: Array<{ id: string | number }> }>(
      server,
      "/v2/homeroom/gethome",
      '{"fg": true, "fetch_share": true, "fetch_share_dev": true, "limit": 300, "app_ver": 7}',
    );
    for (const home of own?.homelist ?? []) {
      homes.push({ homeId: String(home.id), owner: this.session.userId });
    }
    const count = await this.call<{
      share?: {
        share_family?: Array<{
          home_id: string | number;
          home_owner: string | number;
        }>;
      };
    }>(
      server,
      "/v2/user/get_device_cnt",
      '{ "fetch_own": true, "fetch_share": true}',
    );
    for (const home of count?.share?.share_family ?? []) {
      homes.push({
        homeId: String(home.home_id),
        owner: String(home.home_owner),
      });
    }
    return homes;
  }

  /**
   * @param server The regional server
   * @param home The home
   * @returns The devices of the home
   */
  async getHomeDevices(
    server: CloudServer,
    home: Home,
  ): Promise<CloudDevice[]> {
    const result = await this.call<{
      device_info?: Array<Record<string, unknown>> | null;
    }>(
      server,
      "/v2/home/home_device_list",
      `{"home_owner": ${home.owner},"home_id": ${home.homeId},  "limit": 200,  "get_split_device": true, "support_smart_home": true}`,
    );
    return (result?.device_info ?? []).map((device) => ({
      did: String(device.did),
      name: String(device.name ?? ""),
      model: String(device.model ?? ""),
      token: String(device.token ?? ""),
      localip: optionalString(device.localip),
      mac: optionalString(device.mac),
      isOnline:
        typeof device.isOnline === "boolean" ? device.isOnline : undefined,
      server,
      homeId: home.homeId,
      homeOwner: home.owner,
    }));
  }

  /**
   * Lists the devices of the account, with their tokens.
   *
   * @param options The options
   * @param options.servers The servers to check (all of them by default)
   * @returns The devices
   */
  async getDevices(
    options: { servers?: readonly CloudServer[] } = {},
  ): Promise<CloudDevice[]> {
    const devices = new Map<string, CloudDevice>();
    for (const server of options.servers ?? CLOUD_SERVERS) {
      let homes: Home[];
      try {
        homes = await this.getHomes(server);
      } catch (err) {
        if (err instanceof CloudSessionExpiredError) throw err;
        debug(`Unable to get the homes in ${server}: ${err}`);
        continue;
      }
      const seen = new Set<string>();
      for (const home of homes) {
        if (seen.has(home.homeId)) continue;
        seen.add(home.homeId);
        try {
          for (const device of await this.getHomeDevices(server, home)) {
            if (!devices.has(device.did)) devices.set(device.did, device);
          }
        } catch (err) {
          if (err instanceof CloudSessionExpiredError) throw err;
          debug(
            `Unable to get the devices of home ${home.homeId} in ${server}: ${err}`,
          );
        }
      }
    }
    return [...devices.values()];
  }

  /**
   * Downloads a file (e.g. a map file from {@link XiaomiCloud.getMapFileUrl}).
   *
   * @param url The URL
   * @returns The file contents
   */
  async download(url: string): Promise<Buffer> {
    const response = await this.http.request(url, { timeoutMs: 30_000 });
    if (response.status !== 200) {
      throw new CloudError(
        `Unable to download the file (HTTP ${response.status})`,
      );
    }
    return response.body;
  }

  /**
   * Gets the URL of a map file (Roborock and Xiaomi vacuums). The map name comes from the device (`get_map_v1`).
   *
   * @param server The regional server of the device
   * @param mapName The map name
   * @returns The URL of the (gzipped) map file
   */
  async getMapFileUrl(
    server: CloudServer | string,
    mapName: string,
  ): Promise<string> {
    const result = await this.call<{ url?: string } | null>(
      server,
      "/home/getmapfileurl",
      `{"obj_name":"${mapName}"}`,
    );
    if (!result?.url) throw new CloudApiError(`No map file for ${mapName}`);
    return result.url;
  }

  /**
   * Gets the URL of a map file of the newer vacuums (Dreame, Viomi, Roidmi…).
   *
   * @param server The regional server of the device
   * @param did The device ID
   * @param mapName The map name
   * @returns The URL of the map file
   */
  async getInterimFileUrl(
    server: CloudServer | string,
    did: string,
    mapName: string,
  ): Promise<string> {
    const result = await this.call<{ url?: string } | null>(
      server,
      "/v2/home/get_interim_file_url",
      `{"obj_name":"${this.session.userId}/${did}/${mapName}"}`,
    );
    if (!result?.url) throw new CloudApiError(`No map file for ${mapName}`);
    return result.url;
  }
}

/**
 * @param value A value of the response
 * @returns The value, if it's a non-empty string
 */
function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
