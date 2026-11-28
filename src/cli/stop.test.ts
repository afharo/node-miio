import { EventEmitter } from "node:events";

import { describe, test, expect, vi } from "vitest";

import { stopGracefully } from "./stop.js";

function fakeProcess() {
  return Object.assign(new EventEmitter(), { exit: vi.fn() });
}

describe("stopGracefully", () => {
  test.each(["SIGINT", "SIGTERM"])(
    "%s stops, then exits with the current exit code",
    async (signal) => {
      const proc = fakeProcess();
      let finish!: () => void;
      const stop = vi.fn(
        () => new Promise<void>((resolve) => (finish = resolve)),
      );
      const onStopping = vi.fn();
      stopGracefully(stop, onStopping, proc);

      proc.emit(signal);
      expect(onStopping).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(proc.exit).not.toHaveBeenCalled();

      finish();
      await new Promise(setImmediate);
      expect(proc.exit).toHaveBeenCalledWith();
    },
  );

  test.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ])("a second %s quits right away (exit code %p)", (signal, code) => {
    const proc = fakeProcess();
    const stop = vi.fn(() => new Promise<void>(() => {}));
    stopGracefully(stop, undefined, proc);
    proc.emit("SIGINT");
    proc.emit(signal);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(proc.exit).toHaveBeenCalledWith(code);
  });

  test("exits even when stopping fails", async () => {
    const proc = fakeProcess();
    stopGracefully(() => Promise.reject(new Error("x")), undefined, proc);
    proc.emit("SIGTERM");
    await new Promise(setImmediate);
    expect(proc.exit).toHaveBeenCalledWith();
  });
});
