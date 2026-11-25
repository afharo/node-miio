import { EventEmitter } from "node:events";

import { stopGracefully } from "./stop";

function fakeProcess() {
  return Object.assign(new EventEmitter(), { exit: jest.fn() });
}

describe("stopGracefully", () => {
  test.each(["SIGINT", "SIGTERM"])(
    "%s stops, then exits with the current exit code",
    async (signal) => {
      const proc = fakeProcess();
      let finish!: () => void;
      const stop = jest.fn(
        () => new Promise<void>((resolve) => (finish = resolve)),
      );
      const onStopping = jest.fn();
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

  test("a second signal quits right away", () => {
    const proc = fakeProcess();
    const stop = jest.fn(() => new Promise<void>(() => {}));
    stopGracefully(stop, undefined, proc);
    proc.emit("SIGINT");
    proc.emit("SIGINT");
    expect(stop).toHaveBeenCalledTimes(1);
    expect(proc.exit).toHaveBeenCalledWith(130);
  });

  test("exits even when stopping fails", async () => {
    const proc = fakeProcess();
    stopGracefully(() => Promise.reject(new Error("x")), undefined, proc);
    proc.emit("SIGTERM");
    await new Promise(setImmediate);
    expect(proc.exit).toHaveBeenCalledWith();
  });
});
