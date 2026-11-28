import { describe, test, expect, afterEach, vi } from "vitest";

import { configureLogging, createDebug, maskToken, redact } from "./logger.js";
import { DeviceInfo } from "./device_info.js";
import { createFakeHandle } from "./test_utils.test.mock.js";
import { Vacuum } from "./devices/vacuums/vacuum.js";

describe("logger", () => {
  afterEach(() => configureLogging({ logger: undefined }));

  test("sends the messages to the global logger, with the namespace", () => {
    const logger = { debug: vi.fn() };
    configureLogging({ logger });
    createDebug("miio:test")("Hello", { a: 1 }, 2);
    expect(logger.debug).toHaveBeenCalledWith("[miio:test] Hello { a: 1 } 2");
  });

  test("prefers the logger returned by getLogger (e.g. the device's)", () => {
    const globalLogger = { debug: vi.fn() };
    const deviceLogger = { debug: vi.fn() };
    configureLogging({ logger: globalLogger });
    createDebug("miio:test", () => deviceLogger)("Hello");
    expect(deviceLogger.debug).toHaveBeenCalledWith("[miio:test] Hello");
    expect(globalLogger.debug).not.toHaveBeenCalled();
  });

  test("falls back to the global logger when getLogger returns nothing", () => {
    const logger = { debug: vi.fn() };
    configureLogging({ logger });
    createDebug("miio:test", () => undefined)("Hello");
    expect(logger.debug).toHaveBeenCalledWith("[miio:test] Hello");
  });

  test("does nothing without a logger", () => {
    expect(() => createDebug("miio:test")("Hello")).not.toThrow();
  });

  test("doesn't treat the message as a format string", () => {
    const logger = { debug: vi.fn() };
    configureLogging({ logger });
    createDebug("miio:test")("100%s");
    expect(logger.debug).toHaveBeenCalledWith("[miio:test] 100%s");
  });

  test.each([
    [
      '{"id":1,"method":"miIO.config_router","params":{"ssid":"home","passwd":"secret"}}',
      '{"id":1,"method":"miIO.config_router","params":{"ssid":"home","passwd":"***"}}',
    ],
    ['{"result":{"token":"0123456789abcdef"}}', '{"result":{"token":"***"}}'],
    [
      '{"password": "x", "ssecurity":"y", "serviceToken":"z"}',
      '{"password":"***", "ssecurity":"***", "serviceToken":"***"}',
    ],
    [
      '{"method":"get_status","params":[]}',
      '{"method":"get_status","params":[]}',
    ],
  ])("redacts secrets: %s", (message, expected) => {
    expect(redact(message)).toBe(expected);
  });

  test("masks tokens", () => {
    expect(maskToken("0123456789abcdef")).toBe("0123***");
    expect(maskToken(undefined)).toBe("undefined");
  });

  test("redacts what's sent to the logger", () => {
    const logger = { debug: vi.fn() };
    configureLogging({ logger });
    createDebug("miio:test")('-> {"token":"abc"}');
    expect(logger.debug).toHaveBeenCalledWith('[miio:test] -> {"token":"***"}');
  });

  describe("devices", () => {
    test("DeviceInfo logs to its logger, and never the full token", () => {
      const logger = { debug: vi.fn() };
      const info = new DeviceInfo({ socket: {} as never }, 1234, "192.168.1.2");
      info.logger = logger;
      info.token = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
      expect(logger.debug).toHaveBeenCalledWith(
        "[thing:miio:1234] Using manual token: 0123***",
      );
    });

    test("devices log to the logger of their DeviceInfo", () => {
      const logger = { debug: vi.fn() };
      const { handle } = createFakeHandle("roborock.vacuum.s5", {});
      handle.api.logger = logger;
      const vacuum = new Vacuum(handle);
      vacuum.setRawProperty("battery", 42);
      expect(logger.debug).toHaveBeenCalledWith(
        "[thing:miio:1234] Property batteryLevel changed from undefined to 42",
      );
    });
  });
});
