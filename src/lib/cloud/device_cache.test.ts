import { CloudDeviceCache } from "./device_cache";
import type { CloudDevice } from "./client";

const device = (overrides: Partial<CloudDevice>): CloudDevice => ({
  did: "1",
  name: "Robot",
  model: "roborock.vacuum.s5",
  token: "abc",
  localip: "192.168.1.2",
  server: "de",
  homeId: "h",
  homeOwner: "o",
  ...overrides,
});

describe("CloudDeviceCache", () => {
  test("lists the devices once, and finds them by ID, token or IP", async () => {
    const getDevices = jest
      .fn()
      .mockResolvedValue([
        device({ did: "1", token: "AAA", localip: "10.0.0.1" }),
        device({ did: "2", token: "bbb", localip: "10.0.0.2" }),
      ]);
    const cache = new CloudDeviceCache({ getDevices }, { servers: ["de"] });
    await expect(cache.find({ did: 2 })).resolves.toMatchObject({ did: "2" });
    await expect(cache.find({ token: "aaa" })).resolves.toMatchObject({
      did: "1",
    });
    await expect(cache.find({ ip: "10.0.0.2" })).resolves.toMatchObject({
      did: "2",
    });
    expect(getDevices).toHaveBeenCalledTimes(1);
    expect(getDevices).toHaveBeenCalledWith({ servers: ["de"] });
  });

  test("downloads the list again once when a device is not in the cached one", async () => {
    const getDevices = jest
      .fn()
      .mockResolvedValueOnce([device({ did: "1" })])
      .mockResolvedValue([device({ did: "1" }), device({ did: "3" })]);
    const cache = new CloudDeviceCache({ getDevices });
    await cache.list();
    await expect(cache.find({ did: "3" })).resolves.toMatchObject({
      did: "3",
    });
    await expect(cache.find({ did: "4" })).resolves.toBeUndefined();
    expect(getDevices).toHaveBeenCalledTimes(3);
  });

  test("a failure is not cached", async () => {
    const getDevices = jest
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue([device({})]);
    const cache = new CloudDeviceCache({ getDevices });
    await expect(cache.list()).rejects.toThrow("network");
    await expect(cache.list()).resolves.toHaveLength(1);
    cache.clear();
    await cache.list();
    expect(getDevices).toHaveBeenCalledTimes(3);
  });
});
