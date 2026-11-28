import { describe, test, expect, vi, beforeEach } from "vitest";

import { DeviceManagement, type DeviceHandle } from "./management.js";
import { tokens } from "./tokens.js";
import { connectToDevice } from "./connect_to_device.js";

vi.mock("./connect_to_device.js", () => ({ connectToDevice: vi.fn() }));
vi.mock("./tokens.js", () => ({ tokens: { update: vi.fn() } }));

function setup(api: Record<string, unknown> = {}) {
  const call = vi.fn();
  const handle = {
    ref: { release: vi.fn() },
    api: {
      id: 42,
      model: "some.model.v1",
      token: Buffer.from("aabb", "hex"),
      autoToken: true,
      address: "10.0.0.5",
      port: 54321,
      call,
      ...api,
    },
  } as unknown as DeviceHandle;
  return { management: new DeviceManagement({ handle }), call };
}

describe("DeviceManagement", () => {
  beforeEach(() => vi.clearAllMocks());

  test("exposes the connection details", () => {
    const { management } = setup();
    expect(management.model).toBe("some.model.v1");
    expect(management.token).toBe("aabb");
    expect(management.autoToken).toBe(true);
    expect(management.address).toBe("10.0.0.5");
    expect(management.port).toBe(54321);
  });

  test("token is null when unknown", () => {
    expect(setup({ token: null }).management.token).toBeNull();
  });

  test("info and wirelessState call the device", async () => {
    const { management, call } = setup();
    call.mockResolvedValueOnce({ model: "x" }).mockResolvedValueOnce({
      state: "online",
    });
    await expect(management.info()).resolves.toStrictEqual({ model: "x" });
    await expect(management.wirelessState()).resolves.toStrictEqual({
      state: "online",
    });
    expect(call.mock.calls.map((c) => c[0])).toStrictEqual([
      "miIO.info",
      "miIO.wifi_assoc_state",
    ]);
  });

  describe("updateWireless", () => {
    test.each([0, "OK", "ok"])(
      "succeeds when the device answers %j",
      async (r) => {
        const { management, call } = setup();
        call.mockResolvedValue(r);
        const options = { ssid: "net", passwd: "secret" };
        await expect(management.updateWireless(options)).resolves.toBe(true);
        expect(call).toHaveBeenCalledWith("miIO.config_router", options);
      },
    );

    test("fails on an unexpected answer", async () => {
      const { management, call } = setup();
      call.mockResolvedValue("error");
      await expect(
        management.updateWireless({ ssid: "a", passwd: "b" }),
      ).rejects.toThrow("Failed updating wireless");
    });

    test("validates the options before calling the device", async () => {
      const { management, call } = setup();
      await expect(management.updateWireless({ passwd: "b" })).rejects.toThrow(
        "options.ssid must be a string",
      );
      await expect(management.updateWireless({ ssid: "a" })).rejects.toThrow(
        "options.passwd must be a string",
      );
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe("updateToken", () => {
    test("connects with the new token, saves it and releases the device", async () => {
      const destroy = vi.fn();
      vi.mocked(connectToDevice).mockResolvedValue({ destroy } as never);
      const { management } = setup();
      await expect(management.updateToken("0a0b")).resolves.toBe(true);
      expect(connectToDevice).toHaveBeenCalledWith({
        address: "10.0.0.5",
        port: 54321,
        token: "0a0b",
      });
      expect(tokens.update).toHaveBeenCalledWith(
        "42",
        Buffer.from("0a0b", "hex"),
      );
      expect(destroy).toHaveBeenCalledOnce();
    });

    test("accepts a Buffer", async () => {
      vi.mocked(connectToDevice).mockResolvedValue({
        destroy: vi.fn(),
      } as never);
      const { management } = setup();
      await expect(
        management.updateToken(Buffer.from("0a0b", "hex")),
      ).resolves.toBe(true);
      expect(connectToDevice).toHaveBeenCalledWith(
        expect.objectContaining({ token: "0a0b" }),
      );
    });

    test("returns false when the device can't be reached with it", async () => {
      vi.mocked(connectToDevice).mockRejectedValue(new Error("timeout"));
      const { management } = setup();
      await expect(management.updateToken("0a0b")).resolves.toBe(false);
      expect(tokens.update).not.toHaveBeenCalled();
    });

    test("rejects invalid tokens", async () => {
      const { management } = setup();
      await expect(management.updateToken(123 as never)).rejects.toThrow(
        "Token must be a hex-string or a Buffer",
      );
    });
  });
});
