import { EventEmitter } from "node:events";

import chalk from "chalk";

import { doneMessage, formatDuration, reportWhenDone } from "./done";

describe("formatDuration", () => {
  test.each([
    [0, "0ms"],
    [127.4, "127ms"],
    [999, "999ms"],
    [1000, "1.0s"],
    [2149, "2.1s"],
    [59_940, "59.9s"],
    [65_000, "1m 5s"],
    [600_000, "10m 0s"],
  ])("%p → %p", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("doneMessage", () => {
  test("succeeded", () => {
    expect(doneMessage(0, 127)).toBe(chalk.green("Done (succeeded in 127ms)"));
  });

  test("failed", () => {
    expect(doneMessage(1, 2100)).toBe(chalk.red("Done (failed after 2.1s)"));
  });
});

describe("reportWhenDone", () => {
  test("prints the message when a command ran", () => {
    const proc = new EventEmitter();
    const print = jest.fn();
    const started = reportWhenDone(proc, print);
    started();
    proc.emit("exit", 1);
    expect(print).toHaveBeenCalledWith(
      expect.stringContaining("Done (failed after"),
    );
  });

  test("uses the exit code of the process when the event has none", () => {
    const proc = Object.assign(new EventEmitter(), { exitCode: 0 });
    const print = jest.fn();
    reportWhenDone(proc, print)();
    proc.emit("exit");
    expect(print).toHaveBeenCalledWith(
      expect.stringContaining("Done (succeeded in"),
    );
  });

  test("prints nothing when no command ran (--help, usage errors)", () => {
    const proc = new EventEmitter();
    const print = jest.fn();
    reportWhenDone(proc, print);
    proc.emit("exit", 0);
    expect(print).not.toHaveBeenCalled();
  });
});
