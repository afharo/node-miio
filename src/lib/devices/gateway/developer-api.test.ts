import { EventEmitter } from "node:events";
import dgram from "node:dgram";
import os from "node:os";

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

import DeveloperApi from "./developer-api";

class FakeSocket extends EventEmitter {
  bind = vi.fn();
  send = vi.fn();
  close = vi.fn();
  addMembership = vi.fn();

  /**
   * @param message What the gateway sends
   */
  receive(message: unknown) {
    this.emit("message", Buffer.from(JSON.stringify(message)));
  }
}

describe("DeveloperApi", () => {
  let socket: FakeSocket;
  const parent = { debug: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    socket = new FakeSocket();
    vi.spyOn(dgram, "createSocket").mockReturnValue(
      socket as unknown as dgram.Socket,
    );
    vi.spyOn(os, "networkInterfaces").mockReturnValue({
      en0: [
        { family: "IPv4", address: "192.168.1.10" } as os.NetworkInterfaceInfo,
        { family: "IPv6", address: "fe80::1" } as os.NetworkInterfaceInfo,
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("joins the multicast group and asks who's there", () => {
    new DeveloperApi(parent, "192.168.1.2");
    expect(socket.bind).toHaveBeenCalledWith({ port: 9898, exclusive: true });

    socket.emit("listening");

    expect(socket.addMembership).toHaveBeenCalledTimes(1);
    expect(socket.addMembership).toHaveBeenCalledWith(
      "224.0.0.50",
      "192.168.1.10",
    );
    expect(socket.send).toHaveBeenCalledWith(
      '{"cmd":"whois"}',
      0,
      15,
      4321,
      "224.0.0.50",
    );
  });

  test("is ready when the gateway answers, and talks to its port", () => {
    const api = new DeveloperApi(parent, "192.168.1.2");
    const ready = vi.fn();
    api.on("ready", ready);

    socket.receive({ cmd: "iam", ip: "192.168.1.3", port: 1, sid: "other" });
    expect(ready).not.toHaveBeenCalled();

    socket.receive({ cmd: "iam", ip: "192.168.1.2", port: 9999, sid: "gw" });
    expect(ready).toHaveBeenCalled();
    expect(api.sid).toBe("gw");

    api.read("158d0001");
    expect(socket.send).toHaveBeenLastCalledWith(
      '{"cmd":"read","sid":"158d0001"}',
      0,
      31,
      9999,
      "192.168.1.2",
    );
  });

  test("is ready after a second without an answer", () => {
    const api = new DeveloperApi(parent, "192.168.1.2");
    const ready = vi.fn();
    api.on("ready", ready);
    socket.emit("listening");

    vi.advanceTimersByTime(1000);
    expect(ready).toHaveBeenCalled();
  });

  test("emits the properties of the gateway (id 0) and of its sub-devices", () => {
    const api = new DeveloperApi(parent, "192.168.1.2");
    const changed = vi.fn();
    const sensor = vi.fn();
    api.on("propertiesChanged", changed);
    api.on("properties:158d0001", sensor);

    socket.receive({
      cmd: "heartbeat",
      model: "gateway",
      sid: "gw",
      data: '{"rgb":0}',
    });
    socket.receive({
      cmd: "report",
      model: "sensor_ht",
      sid: "158d0001",
      data: '{"temperature":"2150"}',
    });

    expect(changed).toHaveBeenNthCalledWith(1, { id: "0", data: { rgb: 0 } });
    expect(changed).toHaveBeenNthCalledWith(2, {
      id: "158d0001",
      data: { temperature: "2150" },
    });
    expect(sensor).toHaveBeenCalledWith({ temperature: "2150" });
  });

  test("emits an error for a message that isn't JSON", () => {
    const api = new DeveloperApi(parent, "192.168.1.2");
    const error = vi.fn();
    api.on("error", error);

    socket.emit("message", Buffer.from("not json"));

    expect(error).toHaveBeenCalledWith(expect.any(SyntaxError));
  });

  test("destroy closes the socket", () => {
    new DeveloperApi(parent, "192.168.1.2").destroy();
    expect(socket.close).toHaveBeenCalled();
  });
});
