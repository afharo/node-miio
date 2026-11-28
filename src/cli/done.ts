import { performance } from "node:perf_hooks";
import { styleText } from "node:util";

import { CANCELLED_EXIT_CODES } from "./stop.js";

/** The message goes to stderr: colour it only when stderr supports colours */
const STDERR = { stream: process.stderr };

/**
 * @param ms A duration in milliseconds
 * @returns The duration for people: `127ms`, `2.1s`, `1m 5s`
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * @param exitCode The process' exit code
 * @param ms How long the command took
 * @returns The last line of a command: whether it succeeded, failed or was cancelled (forced quit), and how long it
 *   took
 */
export function doneMessage(exitCode: number, ms: number): string {
  const duration = formatDuration(ms);
  if (exitCode === 0)
    return styleText("green", `Done (succeeded in ${duration})`, STDERR);
  if ((Object.values(CANCELLED_EXIT_CODES) as number[]).includes(exitCode)) {
    return styleText("yellow", `Done (cancelled after ${duration})`, STDERR);
  }
  return styleText("red", `Done (failed after ${duration})`, STDERR);
}

/** The parts of `process` that {@link reportWhenDone} uses */
interface ExitingProcess {
  on(event: "exit", listener: (code: number) => void): unknown;
  exitCode?: number | string | null;
}

/**
 * Prints {@link doneMessage} when the process exits after running a command (not after `--help`, `--version` or a
 * usage error, which don't run one). It goes to stderr, so the output of commands like `spec --json` can still be
 * piped.
 *
 * @param proc The process (to test it)
 * @param print Where to print the message (to test it)
 * @returns A yargs middleware, that marks the start of the command
 */
export function reportWhenDone(
  proc: ExitingProcess = process,
  print: (message: string) => void = (message) => console.error(message),
) {
  let started: number | undefined;
  proc.on("exit", (code: number) => {
    if (started === undefined) return;
    print(
      doneMessage(
        Number(code ?? proc.exitCode ?? 0),
        performance.now() - started,
      ),
    );
  });
  return () => {
    started = performance.now();
  };
}
