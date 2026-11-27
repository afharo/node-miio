import { describe, test, expect, vi } from "vitest";

import { encryptedApi, fakeFetch, type Handler } from "./cloud.test.mock";
import { XiaomiCloud } from "./client";
import { CloudApiError, CloudSessionExpiredError } from "./errors";

vi.mock("debug", () => ({ default: vi.fn(() => vi.fn()) }));

const session = {
  userId: "1001",
  ssecurity: "AAECAwQFBgcICQoLDA0ODw==",
  serviceToken: "service-token",
};
const ok = (result: unknown) => ({ code: 0, message: "ok", result });
const api = (respond: (data: string) => unknown): Handler =>
  encryptedApi(session.ssecurity, respond);

const vacuum = {
  did: "123456",
  name: "Robot",
  model: "roborock.vacuum.s5",
  token: "0123456789abcdef0123456789abcdef",
  localip: "192.168.1.20",
  mac: "AA:BB:CC:DD:EE:FF",
  isOnline: true,
};

describe("XiaomiCloud", () => {
  test("apiUrl", () => {
    expect(XiaomiCloud.apiUrl("cn")).toBe("https://api.io.mi.com/app");
    expect(XiaomiCloud.apiUrl("de")).toBe("https://de.api.io.mi.com/app");
  });

  test("call: signs and encrypts the request, decrypts the response", async () => {
    const { fetch, requests } = fakeFetch({
      "POST de.api.io.mi.com/app/v2/homeroom/gethome": api((data) =>
        ok({ echo: JSON.parse(data) }),
      ),
    });
    const cloud = new XiaomiCloud(session, { fetch });
    await expect(
      cloud.call("de", "/v2/homeroom/gethome", { a: 1 }),
    ).resolves.toStrictEqual({
      echo: { a: 1 },
    });

    const [request] = requests;
    expect(request.cookies).toMatchObject({
      userId: "1001",
      serviceToken: "service-token",
      yetAnotherServiceToken: "service-token",
    });
    expect(request.headers["miot-encrypt-algorithm"]).toBe("ENCRYPT-RC4");
    const query = request.url.searchParams;
    expect([...query.keys()]).toStrictEqual([
      "data",
      "rc4_hash__",
      "signature",
      "ssecurity",
      "_nonce",
    ]);
    // The data is encrypted
    expect(query.get("data")).not.toContain("{");
  });

  test("call: API errors and expired sessions", async () => {
    const { fetch } = fakeFetch({
      "POST de.api.io.mi.com/app/error": api(() => ({
        code: -8,
        message: "data invalid",
      })),
      "POST de.api.io.mi.com/app/expired": () => ({
        status: 401,
        text: "auth err",
      }),
      "POST de.api.io.mi.com/app/down": () => ({ status: 503, text: "" }),
    });
    const cloud = new XiaomiCloud(session, { fetch });
    await expect(cloud.call("de", "/error", {})).rejects.toThrow(
      new CloudApiError("/error failed: data invalid", -8),
    );
    await expect(cloud.call("de", "/expired", {})).rejects.toBeInstanceOf(
      CloudSessionExpiredError,
    );
    await expect(cloud.call("de", "/down", {})).rejects.toThrow("HTTP 503");
  });

  describe("getDevices", () => {
    const routes = (): Record<string, Handler> => ({
      // de: one own home and one shared home
      "POST de.api.io.mi.com/app/v2/homeroom/gethome": api(() =>
        ok({ homelist: [{ id: "11" }], share_home_list: [] }),
      ),
      "POST de.api.io.mi.com/app/v2/user/get_device_cnt": api(() =>
        ok({ share: { share_family: [{ home_id: 22, home_owner: 2002 }] } }),
      ),
      "POST de.api.io.mi.com/app/v2/home/home_device_list": api((data) => {
        const { home_id, home_owner } = JSON.parse(data);
        if (home_id === 11 && home_owner === 1001)
          return ok({ device_info: [vacuum] });
        if (home_id === 22 && home_owner === 2002) {
          return ok({
            device_info: [
              {
                ...vacuum,
                did: "999",
                name: "Shared",
                model: "dreame.vacuum.p2008",
                localip: "",
              },
              // Listed in both homes: reported once
              vacuum,
            ],
          });
        }
        return ok({ device_info: null });
      }),
      // cn: no homes; other servers: errors (skipped)
      "POST api.io.mi.com/app/v2/homeroom/gethome": api(() =>
        ok({ homelist: [] }),
      ),
      "POST api.io.mi.com/app/v2/user/get_device_cnt": api(() =>
        ok({ share: {} }),
      ),
    });

    test("lists the devices of every home, with their tokens", async () => {
      const { fetch } = fakeFetch(routes());
      const cloud = new XiaomiCloud(session, { fetch });
      await expect(cloud.getDevices()).resolves.toStrictEqual([
        { ...vacuum, server: "de", homeId: "11", homeOwner: "1001" },
        {
          ...vacuum,
          did: "999",
          name: "Shared",
          model: "dreame.vacuum.p2008",
          localip: undefined,
          server: "de",
          homeId: "22",
          homeOwner: "2002",
        },
      ]);
    });

    test("findDevice by ID, token or IP", async () => {
      const { fetch } = fakeFetch(routes());
      const cloud = new XiaomiCloud(session, { fetch });
      await expect(cloud.findDevice({ did: 999 })).resolves.toMatchObject({
        name: "Shared",
      });
      await expect(
        cloud.findDevice({ token: vacuum.token.toUpperCase() }),
      ).resolves.toMatchObject({ did: "123456", server: "de" });
      await expect(
        cloud.findDevice({ ip: "192.168.1.20" }),
      ).resolves.toMatchObject({ did: "123456" });
      await expect(
        cloud.findDevice({ ip: "10.0.0.1" }),
      ).resolves.toBeUndefined();
    });

    test("only the given servers", async () => {
      const { fetch, requests } = fakeFetch(routes());
      const cloud = new XiaomiCloud(session, { fetch });
      await expect(
        cloud.getDevices({ servers: ["cn"] }),
      ).resolves.toStrictEqual([]);
      expect(new Set(requests.map((r) => r.url.host))).toStrictEqual(
        new Set(["api.io.mi.com"]),
      );
    });

    test("an expired session is not swallowed", async () => {
      const { fetch } = fakeFetch({
        "POST de.api.io.mi.com/app/v2/homeroom/gethome": () => ({
          status: 401,
        }),
      });
      const cloud = new XiaomiCloud(session, { fetch });
      await expect(
        cloud.getDevices({ servers: ["de"] }),
      ).rejects.toBeInstanceOf(CloudSessionExpiredError);
    });
  });

  test("manual scenes: of every home, optionally only the ones using a device", async () => {
    const lists: unknown[] = [];
    const { fetch } = fakeFetch({
      "POST de.api.io.mi.com/app/v2/homeroom/gethome": api(() =>
        ok({ homelist: [{ id: 749 }] }),
      ),
      "POST de.api.io.mi.com/app/v2/user/get_device_cnt": api(() =>
        ok({ share: { share_family: [{ home_id: 800, home_owner: 42 }] } }),
      ),
      "POST de.api.io.mi.com/app/appgateway/miot/appsceneservice/AppSceneService/GetSimpleSceneList":
        api((data) => {
          const request = JSON.parse(data);
          lists.push(request);
          return ok(
            request.home_id === "749"
              ? {
                  manual_scene_info_list: [
                    {
                      scene_id: "2075222181387190272",
                      name: "Vacuum the kitchen",
                      enable: true,
                      authed: ["123456"],
                    },
                    {
                      scene_id: "2075222186600718336",
                      name: "Camera off",
                      authed: [368644599],
                    },
                  ],
                }
              : null,
          );
        }),
      "POST de.api.io.mi.com/app/appgateway/miot/appsceneservice/AppSceneService/RunScene":
        api((data) => ok(JSON.parse(data).scene_id === "1" ? true : false)),
    });
    const cloud = new XiaomiCloud(session, { fetch });
    await expect(cloud.getScenes("de")).resolves.toStrictEqual([
      {
        id: "2075222181387190272",
        name: "Vacuum the kitchen",
        enabled: true,
        homeId: "749",
        dids: ["123456"],
      },
      {
        id: "2075222186600718336",
        name: "Camera off",
        enabled: true,
        homeId: "749",
        dids: ["368644599"],
      },
    ]);
    expect(lists[1]).toMatchObject({ home_id: "800", owner_uid: "42" });
    await expect(
      cloud.getScenes("de", { did: "123456" }),
    ).resolves.toMatchObject([{ name: "Vacuum the kitchen" }]);

    await expect(cloud.runScene("de", "1")).resolves.toBeUndefined();
    await expect(cloud.runScene("de", "2")).rejects.toThrow(
      "The scene 2 didn't run",
    );
  });

  test("map files", async () => {
    const { fetch } = fakeFetch({
      "POST de.api.io.mi.com/app/home/getmapfileurl": api((data) =>
        ok({ url: `https://files.example/${JSON.parse(data).obj_name}.gz` }),
      ),
      "POST de.api.io.mi.com/app/v2/home/get_interim_file_url": api((data) =>
        ok({ url: `https://files.example/${JSON.parse(data).obj_name}` }),
      ),
      "GET files.example/robomap%2F123%2F4.gz": () => ({
        body: Buffer.from([1, 2, 3]),
      }),
    });
    const cloud = new XiaomiCloud(session, { fetch });
    await expect(cloud.getMapFileUrl("de", "robomap/123/4")).resolves.toBe(
      "https://files.example/robomap/123/4.gz",
    );
    await expect(cloud.getInterimFileUrl("de", "123", "map-0")).resolves.toBe(
      "https://files.example/1001/123/map-0",
    );
    await expect(
      cloud.download("https://files.example/robomap%2F123%2F4.gz"),
    ).resolves.toStrictEqual(Buffer.from([1, 2, 3]));
  });
});
