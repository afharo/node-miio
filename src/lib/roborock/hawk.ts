import crypto from "node:crypto";

/**
 * The `rriot` credentials returned by the Roborock login. `u`/`s`/`h` sign the requests to the RRIoT API (`r.a`);
 * `k` and `r.m` are for MQTT.
 */
export interface RoborockRriot {
  u: string;
  s: string;
  h: string;
  k: string;
  r: {
    /** The region */
    r: string;
    /** The RRIoT API URL */
    a: string;
    /** The MQTT URL */
    m: string;
    l?: string;
  };
}

const md5 = (value: string) =>
  crypto.createHash("md5").update(value).digest("hex");

/**
 * @param values The params
 * @returns The MD5 of the params sorted by key (`a=1&b=2`), or `""` if there are none
 */
function hashParams(values?: Record<string, string>) {
  if (!values) return "";
  return md5(
    Object.keys(values)
      .sort()
      .map((key) => `${key}=${values[key]}`)
      .join("&"),
  );
}

export interface HawkOptions {
  /** Query params of the request */
  params?: Record<string, string>;
  /** Form fields of the request body */
  form?: Record<string, string>;
  /** Unix time in seconds (injectable for tests) */
  timestamp?: number;
  /** Random nonce (injectable for tests) */
  nonce?: string;
}

/**
 * The `Authorization` header of the RRIoT API (Hawk-like signature).
 * Format documented by python-roborock (Apache-2.0), `roborock/web_api/_hawk.py`.
 *
 * @param rriot The credentials from the login
 * @param path The path of the request (without host or query string)
 * @param options The params and form of the request
 * @returns The header value
 */
export function hawkAuthorization(
  rriot: RoborockRriot,
  path: string,
  options: HawkOptions = {},
) {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const nonce = options.nonce ?? crypto.randomBytes(6).toString("base64url");
  const prestr = [
    rriot.u,
    rriot.s,
    nonce,
    String(timestamp),
    md5(path),
    hashParams(options.params),
    hashParams(options.form),
  ].join(":");
  const mac = crypto
    .createHmac("sha256", rriot.h)
    .update(prestr)
    .digest("base64");
  return `Hawk id="${rriot.u}",s="${rriot.s}",ts="${timestamp}",nonce="${nonce}",mac="${mac}"`;
}
