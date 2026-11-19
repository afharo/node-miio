/** The `fetch` implementation (injectable, so the cloud client can be tested without network) */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface Cookie {
  name: string;
  value: string;
  /** The domain, without the leading dot */
  domain: string;
}

export interface HttpRequestOptions {
  method?: "GET" | "POST";
  /** Params added to the URL's query string */
  query?: Record<string, string>;
  /** Params sent as an `application/x-www-form-urlencoded` body */
  form?: Record<string, string>;
  headers?: Record<string, string>;
  /** Cookies sent with this request only (on top of the session's cookies) */
  cookies?: Record<string, string>;
  /** Follow the redirects (default) or return the redirect response */
  followRedirects?: boolean;
  /** Request timeout in milliseconds (default 15s) */
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  /** The final URL, after redirects */
  url: string;
  headers: Headers;
  text: string;
  body: Buffer;
}

const MAX_REDIRECTS = 10;

/**
 * A minimal HTTP session on top of `fetch`, with a cookie jar and manual redirects
 * (so the cookies set on every hop of the login flows are kept).
 */
export class HttpSession {
  private cookies: Cookie[] = [];

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  /**
   * @param name The cookie name
   * @param value The cookie value
   * @param domain The domain the cookie applies to (and its subdomains)
   */
  setCookie(name: string, value: string, domain: string) {
    domain = domain.replace(/^\./, "");
    this.cookies = this.cookies.filter(
      (c) => !(c.name === name && c.domain === domain),
    );
    this.cookies.push({ name, value, domain });
  }

  /**
   * @param name The cookie name
   * @param domain If set, only the cookies of this domain (or its parents) are considered
   * @returns The value of the most recently set matching cookie
   */
  getCookie(name: string, domain?: string): string | undefined {
    const host = domain?.replace(/^\./, "");
    return this.cookies
      .filter(
        (c) => c.name === name && (!host || domainMatches(host, c.domain)),
      )
      .at(-1)?.value;
  }

  async request(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse> {
    let method = options.method ?? "GET";
    let body: string | undefined = options.form
      ? new URLSearchParams(options.form).toString()
      : undefined;
    let current = withQuery(url, options.query);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const headers: Record<string, string> = { ...options.headers };
      if (body !== undefined) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      }
      const cookie = this.cookieHeader(current, options.cookies);
      if (cookie) headers["Cookie"] = cookie;

      const response = await this.fetchImpl(current, {
        method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      });
      this.storeCookies(current, response.headers);

      const location = response.headers.get("location");
      if (
        options.followRedirects !== false &&
        response.status >= 300 &&
        response.status < 400 &&
        location
      ) {
        current = new URL(location, current).toString();
        if (response.status !== 307 && response.status !== 308) {
          method = "GET";
          body = undefined;
        }
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        status: response.status,
        url: current,
        headers: response.headers,
        body: buffer,
        text: buffer.toString("utf8"),
      };
    }
    throw new Error(`Too many redirects (${url})`);
  }

  private cookieHeader(url: string, extra: Record<string, string> = {}) {
    const host = new URL(url).hostname;
    const values = new Map<string, string>();
    for (const c of this.cookies) {
      if (domainMatches(host, c.domain)) values.set(c.name, c.value);
    }
    for (const [name, value] of Object.entries(extra)) values.set(name, value);
    return [...values].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  private storeCookies(url: string, headers: Headers) {
    const host = new URL(url).hostname;
    for (const header of headers.getSetCookie?.() ?? []) {
      const [pair, ...attributes] = header.split(";");
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      let domain = host;
      let expired = false;
      for (const attribute of attributes) {
        const [key, attrValue = ""] = attribute.split("=");
        switch (key.trim().toLowerCase()) {
          case "domain":
            domain = attrValue.trim().replace(/^\./, "") || host;
            break;
          case "max-age":
            expired ||= Number(attrValue) <= 0;
            break;
          case "expires":
            expired ||= Date.parse(attrValue) < Date.now();
            break;
        }
      }
      if (expired) {
        this.cookies = this.cookies.filter(
          (c) => !(c.name === name && c.domain === domain),
        );
      } else {
        this.setCookie(name, value, domain);
      }
    }
  }
}

/**
 * @param host The host of the request
 * @param domain The domain of the cookie
 * @returns Whether the cookie applies to the host
 */
function domainMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * @param url The URL
 * @param query The params to add to the query string
 * @returns The URL with the params
 */
function withQuery(url: string, query?: Record<string, string>) {
  if (!query) return url;
  const target = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    target.searchParams.set(key, value);
  }
  return target.toString();
}

/**
 * Parses a JSON response of account.xiaomi.com, which are prefixed with `&&&START&&&`.
 *
 * @param text The response text
 * @returns The parsed JSON
 */
export function parseXiaomiJson<T = Record<string, unknown>>(text: string): T {
  return JSON.parse(text.replace("&&&START&&&", "")) as T;
}
