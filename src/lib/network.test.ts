import { EventEmitter } from "node:events";

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";

const sockets: FakeSocket[] = [];
const packetState = vi.hoisted(() => ({
  deviceId: 0 as number | null,
  data: null as Buffer | null,
  failParse: false,
}));
const infos: FakeDeviceInfo[] = [];
let nextId = 9000;
/** Addresses whose devices have no token: their handshake fails, so they never learn their id */
const withoutToken = new Set<string>();

class FakeSocket extends EventEmitter {
  bind = vi.fn();
  send = vi.fn();
  close = vi.fn();
  setBroadcast = vi.fn();
  address = vi.fn(() => ({ port: 4321 }));
}

class FakeDeviceInfo {
  token: Buffer | null = null;
  model?: string;
  logger?: unknown;
  enriched = false;
  onMessage = vi.fn();
  enrich = vi.fn(async () => {});
  // A real handshake learns the device id
  handshake = vi.fn(async () => {
    if (withoutToken.has(this.address)) {
      throw new MiioError("missing token", "missing-token");
    }
    this.id ??= nextId++;
    return null;
  });
  constructor(
    _network: unknown,
    public id: number | undefined,
    public address: string,
    public port: number,
  ) {
    infos.push(this);
  }
}

vi.mock("node:dgram", () => ({
  default: {
    createSocket: vi.fn(() => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    }),
  },
}));
vi.mock("./device_info.js", () => ({
  get DeviceInfo() {
    return FakeDeviceInfo;
  },
}));
vi.mock("./packet.js", () => ({
  Packet: class {
    handshake = vi.fn();
    raw = Buffer.alloc(32);
    get deviceId() {
      return packetState.deviceId;
    }
    get data() {
      return packetState.data;
    }
  },
}));

import { network } from "./network.js";
import { MiioError } from "./miio_error.js";

/**
 * @param address The address of a device the network created
 * @returns Its fake info
 */
function infoAt(address: string) {
  const info = infos.find((i) => i.address === address);
  if (!info) throw new Error(`No device at ${address}`);
  return info;
}

const rinfo = { address: "10.0.0.2", port: 54321 } as never;

describe("network", () => {
  beforeEach(() => {
    sockets.length = 0;
    infos.length = 0;
    packetState.deviceId = 0;
    packetState.data = null;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("socket is unavailable without references", () => {
    expect(() => network.socket).toThrow(/unavailable/);
  });

  test("creates the socket on the first reference and closes it on the last release", () => {
    const first = network.ref();
    const second = network.ref();
    expect(sockets).toHaveLength(1);
    expect(sockets[0].bind).toHaveBeenCalledOnce();

    sockets[0].emit("listening");
    expect(sockets[0].setBroadcast).toHaveBeenCalledWith(true);

    first.release();
    first.release(); // releasing twice is a no-op
    expect(sockets[0].close).not.toHaveBeenCalled();
    second.release();
    expect(sockets[0].close).toHaveBeenCalledOnce();
    expect(() => network.socket).toThrow();
  });

  test("search broadcasts the handshake twice", () => {
    vi.useFakeTimers();
    const ref = network.ref();
    network.search();
    expect(sockets[0].send).toHaveBeenCalledTimes(1);
    expect(sockets[0].send.mock.calls[0].slice(3)).toStrictEqual([
      54321,
      "255.255.255.255",
    ]);
    vi.advanceTimersByTime(500);
    expect(sockets[0].send).toHaveBeenCalledTimes(2);
    ref.release();
  });

  test("findDevice tracks devices by id and by address", () => {
    const device = network.findDevice(111, rinfo);
    expect(device).toBeInstanceOf(FakeDeviceInfo);
    expect(network.findDevice(111, rinfo)).toBe(device);
    // Same address, different id: the address wins
    expect(network.findDevice(222, rinfo)).toBe(device);
    expect([...network.list()]).toContain(device);
  });

  test("findDeviceViaAddress requires a reference", async () => {
    await expect(
      network.findDeviceViaAddress({ address: "10.0.0.3" }),
    ).rejects.toThrow(/Network communication is unavailable/);
  });

  describe("findDeviceViaAddress", () => {
    let ref: { release: () => void };
    beforeEach(() => {
      ref = network.ref();
    });
    afterEach(() => ref.release());

    test("creates the device, sets token, model and logger, then enriches it", async () => {
      const logger = { debug: vi.fn() } as never;
      const device = await network.findDeviceViaAddress({
        address: "10.0.0.10",
        token: "00ff",
        model: "some.model.v1",
        logger,
      });
      const info = infoAt("10.0.0.10");
      expect(device).toBe(info);
      expect(info.port).toBe(54321);
      expect(info.token).toStrictEqual(Buffer.from([0, 255]));
      expect(info.model).toBe("some.model.v1");
      expect(info.logger).toBe(logger);
      expect(info.handshake).toHaveBeenCalledOnce();
      expect(info.enrich).toHaveBeenCalledOnce();
    });

    test("accepts a Buffer token and a custom port, and reuses the known address", async () => {
      const token = Buffer.alloc(16, 1);
      const first = await network.findDeviceViaAddress({
        address: "10.0.0.11",
        port: 1234,
      });
      expect(infoAt("10.0.0.11").port).toBe(1234);
      const again = await network.findDeviceViaAddress({
        address: "10.0.0.11",
        token,
        model: "ignored",
      });
      expect(again).toBe(first);
      expect(again?.token).toBe(token);
    });

    test("does not override an existing model", async () => {
      const first = await network.findDeviceViaAddress({
        address: "10.0.0.12",
        model: "a.b.c",
      });
      await network.findDeviceViaAddress({
        address: "10.0.0.12",
        model: "x.y.z",
      });
      expect(first?.model).toBe("a.b.c");
    });

    test("suppresses missing-token handshake errors", async () => {
      const pending = network.findDeviceViaAddress({ address: "10.0.0.13" });
      await expect(pending).resolves.toBeDefined();
      const info = infoAt("10.0.0.13");
      info.handshake.mockRejectedValueOnce(
        new MiioError("missing token", "missing-token"),
      );
      await expect(
        network.findDeviceViaAddress({ address: "10.0.0.13" }),
      ).resolves.toBe(info);
    });

    test("devices without an id (missing token) don't collapse into one", async () => {
      withoutToken.add("10.0.0.20").add("10.0.0.21");
      try {
        const first = await network.findDeviceViaAddress({
          address: "10.0.0.20",
        });
        const second = await network.findDeviceViaAddress({
          address: "10.0.0.21",
        });
        expect(first).toBe(infoAt("10.0.0.20"));
        expect(second).toBe(infoAt("10.0.0.21"));
        expect(infoAt("10.0.0.21").enrich).toHaveBeenCalledOnce();
      } finally {
        withoutToken.clear();
      }
    });

    test("rethrows other handshake errors", async () => {
      await network.findDeviceViaAddress({ address: "10.0.0.14" });
      const info = infoAt("10.0.0.14");
      info.handshake.mockRejectedValueOnce(new Error("boom"));
      await expect(
        network.findDeviceViaAddress({ address: "10.0.0.14" }),
      ).rejects.toThrow("boom");
    });
  });

  describe("incoming messages", () => {
    let ref: { release: () => void };
    let onDevice: Mock<(device: FakeDeviceInfo) => void>;
    beforeEach(() => {
      ref = network.ref();
      onDevice = vi.fn<(device: FakeDeviceInfo) => void>();
      network.on("device", onDevice);
    });
    afterEach(() => {
      network.off("device", onDevice);
      ref.release();
    });

    test("a handshake reply enriches and announces a new device", async () => {
      packetState.deviceId = 5001;
      sockets[0].emit("message", Buffer.alloc(32), {
        address: "10.0.1.1",
        port: 54321,
      });
      await vi.waitFor(() => expect(onDevice).toHaveBeenCalledOnce());
      const info = onDevice.mock.calls[0][0] as FakeDeviceInfo;
      expect(info.onMessage).toHaveBeenCalledOnce();
      expect(info.enrich).toHaveBeenCalledOnce();
    });

    test("does not enrich an already enriched device, and ignores errors from enrich", async () => {
      packetState.deviceId = 5002;
      const rinfo2 = { address: "10.0.1.2", port: 54321 };
      sockets[0].emit("message", Buffer.alloc(32), rinfo2);
      await vi.waitFor(() => expect(onDevice).toHaveBeenCalledTimes(1));
      const info = onDevice.mock.calls[0][0] as FakeDeviceInfo;
      info.enriched = true;
      info.enrich.mockClear();
      sockets[0].emit("message", Buffer.alloc(32), rinfo2);
      await vi.waitFor(() => expect(onDevice).toHaveBeenCalledTimes(2));
      expect(info.enrich).not.toHaveBeenCalled();

      info.enriched = false;
      info.enrich.mockRejectedValueOnce(new Error("no"));
      sockets[0].emit("message", Buffer.alloc(32), rinfo2);
      await vi.waitFor(() => expect(onDevice).toHaveBeenCalledTimes(3));
    });

    test("messages with data are routed to the device without announcing it", async () => {
      packetState.deviceId = 5003;
      packetState.data = Buffer.from("x");
      sockets[0].emit("message", Buffer.alloc(32), {
        address: "10.0.1.3",
        port: 54321,
      });
      const info = infoAt("10.0.1.3");
      await vi.waitFor(() => expect(info.onMessage).toHaveBeenCalledOnce());
      expect(onDevice).not.toHaveBeenCalled();
    });

    test("ignores packets without a device id", () => {
      packetState.deviceId = null;
      sockets[0].emit("message", Buffer.alloc(32), {
        address: "10.0.1.4",
        port: 54321,
      });
      expect(infos.find((i) => i.address === "10.0.1.4")).toBeUndefined();
      expect(onDevice).not.toHaveBeenCalled();
    });
  });
});
