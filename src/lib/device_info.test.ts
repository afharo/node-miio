import type { Socket } from "node:dgram";

import { DeviceInfo } from "./device_info";
import { Packet } from "./packet";

const TOKEN = Buffer.from("e381c97af00985577e8e6a3d94732bbe");

/**
 *
 */
function createParentMock() {
  return {
    socket: {
      send: jest
        .fn()
        .mockImplementation((_data, _size, _length, _port, _address, cb) => {
          cb();
        }),
    } as Partial<jest.Mocked<Socket>> as jest.Mocked<Socket>,
  };
}

jest.mock("debug", () => {
  return jest.fn().mockReturnValue(jest.fn());
});

describe("DeviceInfo", () => {
  jest.useFakeTimers();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    test("creates a new DeviceInfo without id", () => {
      const debugMock = jest.requireMock("debug");
      new DeviceInfo(createParentMock(), void 0, "localhost", 1234);
      expect(debugMock).toHaveBeenCalledWith("thing:miio:pending");
    });
    test("creates a new DeviceInfo with id", () => {
      const debugMock = jest.requireMock("debug");
      new DeviceInfo(createParentMock(), 1, "localhost", 1234);
      expect(debugMock).toHaveBeenCalledWith("thing:miio:1");
    });
  });

  describe("token", () => {
    const device = new DeviceInfo(createParentMock(), 1, "localhost", 1234);
    test("initial token does not exist", () => {
      expect(device.token).toBeNull();
    });
    test("token stored", () => {
      expect(device.tokenChanged).toBe(false);
      device.token = Buffer.from("my-token");
      expect(device.tokenChanged).toBe(true);
      expect(device.token.toString("utf8")).toBe("my-token");
    });
  });

  describe("enrich", () => {
    test("fails if the id is not populated yet", async () => {
      const device = new DeviceInfo(
        createParentMock(),
        void 0,
        "localhost",
        1234,
      );
      await expect(device.enrich()).rejects.toThrow(
        "Device has no identifier yet, handshake needed",
      );
    });

    test("returns undefined because everything is properly initialised already", async () => {
      const device = new DeviceInfo(createParentMock(), 1, "localhost", 1234);
      device.token = TOKEN;
      device.tokenChanged = false;
      device.model = "my.model";
      await expect(device.enrich()).resolves.toBeUndefined();
    });

    test("happy path", async () => {
      const model = "my.model";
      const device = new DeviceInfo(createParentMock(), 1, "localhost", 1234);
      device.token = TOKEN;
      device.call = jest.fn().mockImplementation(async () => ({ model }));
      await expect(device.enrich()).resolves.toBeUndefined();
      expect(device.tokenChanged).toBe(false);
      expect(device.model).toBe(model);
      expect(device.enriched).toBe(true);
      expect(device.enrichPromise).toBeNull();
    });

    test("errors with 'missing-token'", async () => {
      const device = new DeviceInfo(createParentMock(), 1, "localhost", 1234);
      device.token = TOKEN;
      device.enrichPromise = Promise.reject({ code: "missing-token" });
      await expect(device.enrich()).rejects.toStrictEqual({
        code: "missing-token",
        device,
      });
      expect(device.tokenChanged).toBe(true);
      expect(device.enriched).toBe(true);
      expect(device.enrichPromise).toBeNull();
    });

    test("errors with 'connection-failure'", async () => {
      const device = new DeviceInfo(createParentMock(), 1, "localhost", 1234);
      device.token = TOKEN;
      device.tokenChanged = false;
      device.enrichPromise = Promise.reject("Something went terribly wrong");
      await expect(device.enrich()).rejects.toThrow(
        "Could not connect to device, token might be wrong",
      );
      expect(device.tokenChanged).toBe(false);
      expect(device.enriched).toBe(true);
      expect(device.enrichPromise).toBeNull();
    });

    test("errors with 'missing-token' custom", async () => {
      const device = new DeviceInfo(createParentMock(), 1, "localhost", 1234);
      device.enrichPromise = Promise.reject("Something went terribly wrong");
      await expect(device.enrich()).rejects.toThrow(
        "Could not connect to device, token needs to be specified",
      );
      expect(device.tokenChanged).toBe(false);
      expect(device.enriched).toBe(true);
      expect(device.enrichPromise).toBeNull();
    });
  });

  describe("handshake", () => {
    test("happy-path: runs the handshake", async () => {
      const packet = new Packet(false);
      const parent = createParentMock();
      const device = new DeviceInfo(parent, 1, "localhost", 1234);
      device.token = TOKEN;
      packet.token = TOKEN;
      parent.socket.send.mockImplementation(
        // @ts-expect-error TS compains because `send` has multiple definitions
        (_msg, _offset, _length, _port, _address, cb) => {
          cb(null, 1);
          packet.data = null;
          device.onMessage(packet.raw);
        },
      );
      const token = await device.handshake();
      expect(token?.toString()).toBe(TOKEN.toString());
      // Second call is not triggered
      const token2 = await device.handshake();
      expect(token2?.toString()).toBe(TOKEN.toString());
    });

    test("fails because 'missing-token'", async () => {
      const packet = new Packet(false);
      const parent = createParentMock();
      const device = new DeviceInfo(parent, 1, "localhost", 1234);
      packet.token = TOKEN;
      parent.socket.send.mockImplementation(
        // @ts-expect-error TS compains because `send` has multiple definitions
        (_msg, _offset, _length, _port, _address, cb) => {
          cb(null, 1);
          packet.data = null;
          device.onMessage(packet.raw);
        },
      );
      await expect(device.handshake()).rejects.toThrow(
        "Could not connect to device, token needs to be specified",
      );
    });

    test("fails because to send the handshake request", async () => {
      const packet = new Packet(false);
      const parent = createParentMock();
      const device = new DeviceInfo(parent, 1, "localhost", 1234);
      packet.token = TOKEN;
      parent.socket.send.mockImplementation(
        // @ts-expect-error TS compains because `send` has multiple definitions
        (_msg, _offset, _length, _port, _address, cb) => {
          cb(new Error("Something went terribly wrong"), 0);
        },
      );
      await expect(device.handshake()).rejects.toThrow(
        "Something went terribly wrong",
      );
    });

    test("timesout after 2 secs", async () => {
      const parent = createParentMock();
      const device = new DeviceInfo(parent, 1, "localhost", 1234);
      device.token = TOKEN;
      const promise = device.handshake();
      jest.advanceTimersByTime(2 * 1000);
      await expect(promise).rejects.toThrow(
        "Could not connect to device, handshake timeout",
      );
    });
  });

  describe("onMessage", () => {
    test("swallows error to parse the message", async () => {
      const device = new DeviceInfo(createParentMock(), 1, "localhost", 1234);
      expect(device.onMessage("test")).toBeUndefined();
    });

    test("handshake message but no handler", async () => {
      const device = new DeviceInfo(createParentMock(), 1, "localhost", 1234);
      const packet = new Packet();
      device.token = TOKEN;
      packet.token = TOKEN;
      packet.data = null;
      expect(device.onMessage(packet.raw)).toBeUndefined();
    });

    test("swallows error because data is not a valid JSON", async () => {
      const device = new DeviceInfo(createParentMock(), 1, "localhost", 1234);
      const packet = new Packet();
      device.token = TOKEN;
      packet.token = TOKEN;
      packet.data = Buffer.from("test").fill(0);
      expect(device.onMessage(packet.raw)).toBeUndefined();
    });

    test("does not call the promise resolvers because there's none", async () => {
      const device = new DeviceInfo(createParentMock(), 1, "localhost", 1234);
      const packet = new Packet();
      device.token = TOKEN;
      packet.token = TOKEN;
      const response = { id: "1", result: "something" };
      packet.data = Buffer.from(JSON.stringify(response));
      expect(device.onMessage(packet.raw)).toBeUndefined();
    });

    test("calls the promise resolver when there's a result", async () => {
      const device = new DeviceInfo(createParentMock(), 1, "localhost", 1234);
      const packet = new Packet();
      device.token = TOKEN;
      packet.token = TOKEN;
      const response = { id: "1", result: "something" };
      const promiseResolvers = { resolve: jest.fn(), reject: jest.fn() };
      device.promises.set("1", promiseResolvers);
      packet.data = Buffer.from(JSON.stringify(response));
      expect(device.onMessage(packet.raw)).toBeUndefined();
      expect(promiseResolvers.resolve).toHaveBeenCalledWith("something");
    });

    test("calls the promise resolver's reject when there's an error", async () => {
      const device = new DeviceInfo(createParentMock(), 1, "localhost", 1234);
      const packet = new Packet();
      device.token = TOKEN;
      packet.token = TOKEN;
      const response = { id: "1", error: "something" };
      const promiseResolvers = { resolve: jest.fn(), reject: jest.fn() };
      device.promises.set("1", promiseResolvers);
      packet.data = Buffer.from(JSON.stringify(response));
      expect(device.onMessage(packet.raw)).toBeUndefined();
      expect(promiseResolvers.reject).toHaveBeenCalledWith("something");
    });
  });

  describe("call", () => {
    test("happy-path: sends a method 'miIO.info'", async () => {
      const packet = new Packet(false);
      const parent = createParentMock();
      const device = new DeviceInfo(parent, 1, "localhost", 1234);
      device.token = TOKEN;
      packet.token = TOKEN;
      parent.socket.send.mockImplementation(
        // @ts-expect-error TS compains because `send` has multiple definitions
        (msg, _offset, _length, _port, _address, cb) => {
          cb(null, 1);
          // Return what you get embedded in `result`
          packet.raw = Buffer.from(msg as string);
          const str = packet.data;
          if (str !== null) {
            const json = JSON.parse(str.toString());
            packet.data = Buffer.from(
              JSON.stringify(Object.assign({}, json, { result: json })),
            );
          }
          device.onMessage(packet.raw);
        },
      );
      const response = await device.call("miIO.info");
      expect(response).toStrictEqual({
        id: device.lastId,
        method: "miIO.info",
        params: [],
      });
    });

    test("timeout error", async () => {
      const packet = new Packet(false);
      const parent = createParentMock();
      const device = new DeviceInfo(parent, 1, "localhost", 1234);
      packet.token = TOKEN;
      device.token = TOKEN;
      device.lastId = 10000;

      parent.socket.send.mockImplementation(
        // @ts-expect-error TS compains because `send` has multiple definitions
        (data, _offset, _length, _port, _address, cb) => {
          cb(null, 1);
          // Reply to handshakes only
          packet.raw = data as Buffer;
          const str = packet.data;
          if (str === null) {
            device.onMessage(packet.raw);
          } else {
            jest.advanceTimersByTime(2 * 1000);
          }
        },
      );
      const promise = device.call("miIO.info", [], { retries: 2 });
      await expect(promise).rejects.toThrow("Call to device timed out");
      expect(device.lastId).toBe(101);
    });

    describe("known errors", () => {
      const packet = new Packet(false);
      packet.token = TOKEN;

      test.each`
        code        | message           | expected
        ${"-5001"}  | ${"invalid_arg"}  | ${"Invalid argument"}
        ${"-5001"}  | ${"Test msg"}     | ${"Test msg"}
        ${"-5005"}  | ${"params error"} | ${"Invalid argument"}
        ${"-5005"}  | ${"Test msg"}     | ${"Test msg"}
        ${"-10000"} | ${"Test msg"}     | ${"Method `miIO.info` is not supported"}
        ${"OTHER"}  | ${"Test msg"}     | ${"Test msg"}
      `("$code | $message", async ({ code, message, expected }) => {
        const parent = createParentMock();
        const device = new DeviceInfo(parent, 1, "localhost", 1234);
        device.token = TOKEN;

        parent.socket.send.mockImplementation(
          // @ts-expect-error TS compains because `send` has multiple definitions
          (data, _offset, _length, _port, _address, cb) => {
            cb(null, 1);
            // Return what you get embedded in `result`
            packet.raw = data as Buffer;
            const str = packet.data;
            if (str !== null) {
              const json = JSON.parse(str.toString());
              packet.data = Buffer.from(
                JSON.stringify({
                  ...json,
                  error: { code, message },
                }),
              );
            }
            device.onMessage(packet.raw);
          },
        );
        await expect(device.call("miIO.info")).rejects.toThrow(expected);
      });
    });
  });
});
