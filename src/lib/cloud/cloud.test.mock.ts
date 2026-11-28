import { decryptRc4, encryptRc4, signedNonce } from "./crypto.js";
import type { FetchLike } from "./http.js";

export interface FakeRequest {
  method: string;
  url: URL;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  form: URLSearchParams;
}

export interface FakeResponse {
  status?: number;
  json?: unknown;
  text?: string;
  body?: Buffer;
  headers?: Record<string, string>;
  setCookies?: string[];
}

export type Handler = (request: FakeRequest) => FakeResponse | undefined;

/**
 * A fake HTTP server: routes `METHOD host/path` to handlers, and records the requests.
 *
 * @param routes The handlers by `METHOD host/path`
 * @returns The `fetch` implementation and the recorded requests
 */
export function fakeFetch(routes: Record<string, Handler>) {
  const requests: FakeRequest[] = [];
  const fetchImpl: FetchLike = async (input, init = {}) => {
    const url = new URL(input);
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).map(
        ([k, v]) => [k.toLowerCase(), v],
      ),
    );
    const cookies = Object.fromEntries(
      (headers.cookie ?? "")
        .split("; ")
        .filter(Boolean)
        .map((pair) => [
          pair.slice(0, pair.indexOf("=")),
          pair.slice(pair.indexOf("=") + 1),
        ]),
    );
    const request: FakeRequest = {
      method: init.method ?? "GET",
      url,
      headers,
      cookies,
      form: new URLSearchParams((init.body as string) ?? ""),
    };
    requests.push(request);
    const handler = routes[`${request.method} ${url.host}${url.pathname}`];
    const response = handler?.(request) ?? { status: 404, text: "not found" };
    const responseHeaders = new Headers(response.headers);
    for (const cookie of response.setCookies ?? []) {
      responseHeaders.append("set-cookie", cookie);
    }
    const body =
      response.body ??
      (response.json !== undefined
        ? JSON.stringify(response.json)
        : (response.text ?? ""));
    return new Response(body, {
      status: response.status ?? 200,
      headers: responseHeaders,
    });
  };
  return { fetch: fetchImpl, requests };
}

/**
 * A handler of the encrypted API (api.io.mi.com): decrypts the request data and encrypts the response.
 *
 * @param ssecurity The ssecurity of the session
 * @param respond Returns the response JSON for the decrypted request data
 * @returns The handler
 */
export function encryptedApi(
  ssecurity: string,
  respond: (data: string, request: FakeRequest) => unknown,
): Handler {
  return (request) => {
    const query = request.url.searchParams;
    const key = signedNonce(ssecurity, query.get("_nonce") ?? "");
    const data = decryptRc4(key, query.get("data") ?? "");
    return { text: encryptRc4(key, JSON.stringify(respond(data, request))) };
  };
}
