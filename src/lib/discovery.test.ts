import { EventEmitter } from "node:events";
import dns from "node:dns";

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
  type MockInstance,
} from "vitest";

import { Browser, Devices } from "./discovery.js";
import { network } from "./network.js";
import { connectToDevice } from "./connect_to_device.js";

vi.mock("./network.js", async () => {
  const { EventEmitter: Emitter } = await import("node:events");
  const release = vi.fn();
  const fake = Object.assign(new Emitter(), {
    search: vi.fn(),
    release,
    ref: vi.fn(() => ({ release })),
  });
  return { network: fake };
});
vi.mock("./connect_to_device.js", () => ({ connectToDevice: vi.fn() }));

const fakeNetwork = network as unknown as EventEmitter & {
  search: Mock;
  ref: Mock;
  release: Mock;
};
const mockedConnect = connectToDevice as Mock;

/** A device as the network reports it */
function found(id: number, address = "192.168.1.2") {
  return { id, address, port: 54321, token: null, autoToken: false };
}

describe("discovery", () => {
  let lookupService: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    // No reverse DNS: the device is added straight away
    lookupService = vi
      .spyOn(dns, "lookupService")
      .mockImplementation(((_address, _port, callback) =>
        callback(new Error("ENOTFOUND"), "", "")) as typeof dns.lookupService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    fakeNetwork.removeAllListeners();
  });

  describe("Browser", () => {
    test("emits the devices the network finds, with on() and onAvailable()", () => {
      const browser = new Browser({});
      const viaOn = vi.fn();
      const viaSubscribe = vi.fn();
      browser.on("available", viaOn);
      browser.onAvailable(viaSubscribe);

      fakeNetwork.emit("device", found(1));

      expect(viaOn).toHaveBeenCalledTimes(1);
      expect(viaSubscribe).toHaveBeenCalledWith(
        expect.objectContaining({ id: "1", address: "192.168.1.2" }),
      );
      expect(browser.services).toHaveLength(1);
      expect(browser.get("1")?.address).toBe("192.168.1.2");
      expect(browser.get("2")).toBeNull();
      void browser.destroy();
    });

    test("does not emit again when the same device answers again", () => {
      const browser = new Browser({});
      const available = vi.fn();
      const update = vi.fn();
      browser.onAvailable(available);
      browser.onUpdate(update);

      fakeNetwork.emit("device", found(1));
      fakeNetwork.emit("device", found(1));
      vi.advanceTimersByTime(5000);

      expect(available).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
      void browser.destroy();
    });

    test("emits an update when the device changes address", () => {
      const browser = new Browser({});
      const update = vi.fn();
      browser.onUpdate(update);

      fakeNetwork.emit("device", found(1));
      fakeNetwork.emit("device", found(1, "192.168.1.3"));

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ address: "192.168.1.3" }),
        expect.objectContaining({ address: "192.168.1.2" }),
      );
      void browser.destroy();
    });

    test("reads the model from the hostname", () => {
      lookupService.mockImplementation((_address, _port, callback) =>
        callback(null, "zhimi-airpurifier-m1_miio12345", ""),
      );
      const browser = new Browser({});
      fakeNetwork.emit("device", found(12345));

      expect(browser.get("12345")).toMatchObject({
        hostname: "zhimi-airpurifier-m1_miio12345",
        model: "zhimi.airpurifier.m1",
      });
      void browser.destroy();
    });

    test("uses the manual tokens", () => {
      const browser = new Browser({ tokens: { 1: "abc" } });
      fakeNetwork.emit("device", found(1));
      expect(browser.get("1")?.token).toBe("abc");
      void browser.destroy();
    });

    test("searches every 5 seconds", () => {
      const browser = new Browser({});
      vi.advanceTimersByTime(15_000);
      expect(fakeNetwork.search).toHaveBeenCalledTimes(3);
      void browser.destroy();
    });

    test("a device is unavailable once it hasn't answered for cacheTime seconds", () => {
      const browser = new Browser({ cacheTime: 60 });
      const unavailable = vi.fn();
      browser.onUnavailable(unavailable);

      fakeNetwork.emit("device", found(1));
      vi.advanceTimersByTime(50_000);
      // It answers again: the expiration starts over
      fakeNetwork.emit("device", found(1));
      vi.advanceTimersByTime(50_000);
      expect(unavailable).not.toHaveBeenCalled();

      // (5s later, once its hostname is looked up, it's added again)
      vi.advanceTimersByTime(15_000);
      expect(unavailable).toHaveBeenCalledWith(
        expect.objectContaining({ id: "1" }),
      );
      expect(browser.services).toHaveLength(0);
      void browser.destroy();
    });

    test("subscriptions can be cancelled", () => {
      const browser = new Browser({});
      const available = vi.fn();
      browser.onAvailable(available).unsubscribe();
      fakeNetwork.emit("device", found(1));
      expect(available).not.toHaveBeenCalled();
      void browser.destroy();
    });

    test("search errors go to the error listeners (and don't throw without them)", () => {
      const browser = new Browser({});
      fakeNetwork.search.mockImplementation(() => {
        throw new Error("EPERM");
      });
      expect(() => vi.advanceTimersByTime(5000)).not.toThrow();

      const error = vi.fn();
      browser.onError(error);
      vi.advanceTimersByTime(5000);
      expect(error).toHaveBeenCalledWith(new Error("EPERM"));
      void browser.destroy();
    });

    test("destroy stops listening, searching and expiring, and releases the network", async () => {
      const browser = new Browser({ cacheTime: 60 });
      const available = vi.fn();
      const unavailable = vi.fn();
      browser.onAvailable(available);
      browser.onUnavailable(unavailable);
      fakeNetwork.emit("device", found(1));

      await browser.destroy();
      fakeNetwork.emit("device", found(2));
      vi.advanceTimersByTime(120_000);

      expect(browser.destroyed).toBe(true);
      expect(available).toHaveBeenCalledTimes(1);
      expect(unavailable).not.toHaveBeenCalled();
      expect(fakeNetwork.search).not.toHaveBeenCalled();
      expect(fakeNetwork.release).toHaveBeenCalled();
      expect(fakeNetwork.listenerCount("device")).toBe(0);
    });
  });

  describe("Devices", () => {
    /** A connected device */
    function fakeDevice(id: string, children: EventEmitter[] = []) {
      const device = new EventEmitter() as EventEmitter &
        Record<string, unknown>;
      device.id = id;
      device.matches = (tag: string) =>
        tag === "cap:children" && children.length > 0;
      device.children = () => children;
      return device;
    }

    test("connects to the devices found, and emits them", async () => {
      const device = fakeDevice("miio:1");
      mockedConnect.mockResolvedValue(device);
      const devices = new Devices({ token: "abc" });
      const available = vi.fn();
      devices.on("available", available);

      fakeNetwork.emit("device", found(1));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockedConnect).toHaveBeenCalledWith({
        address: "192.168.1.2",
        port: 54321,
        model: undefined,
        withPlaceholder: true,
        token: "abc",
      });
      expect(available).toHaveBeenCalledWith(device);
      expect(devices.get("miio:1")).toBe(device);
      await devices.destroy();
    });

    test("connects once, even when the device answers again", async () => {
      mockedConnect.mockResolvedValue(fakeDevice("miio:1"));
      const devices = new Devices({});
      fakeNetwork.emit("device", found(1));
      fakeNetwork.emit("device", found(1, "192.168.1.3"));
      await vi.advanceTimersByTimeAsync(0);
      fakeNetwork.emit("device", found(1));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockedConnect).toHaveBeenCalledTimes(1);
      await devices.destroy();
    });

    test("the device is unavailable when the browser loses it", async () => {
      const device = fakeDevice("miio:1");
      mockedConnect.mockResolvedValue(device);
      const devices = new Devices({ cacheTime: 60 });
      const unavailable = vi.fn();
      devices.onUnavailable(unavailable);

      fakeNetwork.emit("device", found(1));
      // (it's added again 5s later, once its hostname is looked up)
      await vi.advanceTimersByTimeAsync(65_000);

      expect(unavailable).toHaveBeenCalledWith(device);
      expect(devices.services).toHaveLength(0);
      await devices.destroy();
    });

    test("a device lost while connecting is not emitted", async () => {
      let resolve: (device: unknown) => void = () => {};
      mockedConnect.mockReturnValue(
        new Promise((_resolve) => (resolve = _resolve)),
      );
      const devices = new Devices({ cacheTime: 1 });
      const available = vi.fn();
      devices.onAvailable(available);

      fakeNetwork.emit("device", found(1));
      await vi.advanceTimersByTimeAsync(1000);
      resolve(fakeDevice("miio:1"));
      await vi.advanceTimersByTimeAsync(0);

      expect(available).not.toHaveBeenCalled();
      await devices.destroy();
    });

    test("connection errors go to the error listeners", async () => {
      mockedConnect.mockRejectedValue(new Error("timeout"));
      const devices = new Devices({});
      const error = vi.fn();
      devices.onError(error);

      fakeNetwork.emit("device", found(1));
      await vi.advanceTimersByTimeAsync(0);

      expect(error).toHaveBeenCalledWith(new Error("timeout"));
      expect(devices.services).toHaveLength(0);
      await devices.destroy();
    });

    test("emits the sub-devices of gateways, filtered", async () => {
      const sensor = Object.assign(new EventEmitter(), {
        id: "miio:10",
        internalId: "10",
        miioModel: "lumi.sensor_ht",
        model: "lumi.sensor_ht",
        type: "sensor",
      });
      const button = Object.assign(new EventEmitter(), {
        id: "miio:11",
        internalId: "11",
        miioModel: "lumi.switch",
        model: "lumi.switch",
        type: "button",
      });
      const gateway = fakeDevice("miio:1", [sensor]);
      mockedConnect.mockResolvedValue(gateway);
      const devices = new Devices({ filter: (reg) => reg.type === "sensor" });

      fakeNetwork.emit("device", found(1));
      await vi.advanceTimersByTimeAsync(0);
      gateway.emit("thing:available", button);

      expect(devices.get("miio:10")).toBe(sensor);
      expect(devices.get("miio:11")).toBeNull();

      gateway.emit("thing:unavailable", sensor);
      expect(devices.get("miio:10")).toBeNull();
      await devices.destroy();
    });

    test("skipSubDevices skips them", async () => {
      const sensor = Object.assign(new EventEmitter(), {
        id: "miio:10",
        miioModel: "lumi.sensor_ht",
      });
      mockedConnect.mockResolvedValue(fakeDevice("miio:1", [sensor]));
      const devices = new Devices({ skipSubDevices: true });

      fakeNetwork.emit("device", found(1));
      await vi.advanceTimersByTimeAsync(0);

      expect(devices.services.map((s) => s.id)).toEqual(["miio:1"]);
      await devices.destroy();
    });

    test("destroy also destroys the browser", async () => {
      const devices = new Devices({});
      await devices.destroy();
      expect(devices.destroyed).toBe(true);
      expect(fakeNetwork.release).toHaveBeenCalled();
      expect(fakeNetwork.listenerCount("device")).toBe(0);
    });
  });
});
