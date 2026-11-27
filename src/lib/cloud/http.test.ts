import { describe, test, expect } from "vitest";

import { fakeFetch } from "./cloud.test.mock";
import { HttpSession, parseXiaomiJson } from "./http";

describe("HttpSession", () => {
  test("keeps the cookies set on every redirect hop", async () => {
    const { fetch, requests } = fakeFetch({
      "GET a.example.com/start": () => ({
        status: 302,
        headers: { location: "https://b.example.com/next" },
        setCookies: ["first=1; Domain=.example.com; Path=/"],
      }),
      "GET b.example.com/next": () => ({
        status: 303,
        headers: { location: "/final" },
        setCookies: ["second=2"],
      }),
      "GET b.example.com/final": () => ({ text: "done" }),
    });
    const http = new HttpSession(fetch);
    const response = await http.request("https://a.example.com/start");

    expect(response.text).toBe("done");
    expect(response.url).toBe("https://b.example.com/final");
    expect(requests[2].cookies).toStrictEqual({ first: "1", second: "2" });
    expect(http.getCookie("second", "b.example.com")).toBe("2");
    // Host-only cookie: not sent to other hosts
    expect(http.getCookie("second", "a.example.com")).toBeUndefined();
  });

  test("followRedirects: false returns the redirect", async () => {
    const { fetch } = fakeFetch({
      "GET a.example.com/start": () => ({
        status: 302,
        headers: { location: "/x" },
      }),
    });
    const response = await new HttpSession(fetch).request(
      "https://a.example.com/start",
      {
        followRedirects: false,
      },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/x");
  });

  test("query, form, per-request cookies and expired cookies", async () => {
    const { fetch, requests } = fakeFetch({
      "POST a.example.com/form": () => ({
        text: "ok",
        setCookies: ["gone=1; Max-Age=0"],
      }),
    });
    const http = new HttpSession(fetch);
    http.setCookie("gone", "x", "a.example.com");
    await http.request("https://a.example.com/form", {
      method: "POST",
      query: { q: "a b" },
      form: { f: "1" },
      cookies: { extra: "yes" },
    });
    expect(requests[0].url.searchParams.get("q")).toBe("a b");
    expect(requests[0].form.get("f")).toBe("1");
    expect(requests[0].headers["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(requests[0].cookies).toStrictEqual({ gone: "x", extra: "yes" });
    expect(http.getCookie("gone")).toBeUndefined();
  });

  test("parseXiaomiJson strips the &&&START&&& prefix", () => {
    expect(parseXiaomiJson('&&&START&&&{"a":1}')).toStrictEqual({ a: 1 });
  });
});
