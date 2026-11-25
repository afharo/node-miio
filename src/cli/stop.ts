/** The parts of `process` that {@link stopGracefully} uses */
interface SignalledProcess {
  on(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  exit(code?: number): never | void;
}

/** The exit code of a forced quit, like shells use: 128 + the signal's number */
export const CANCELLED_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 } as const;

/**
 * Stops a long-running command (e.g. `discover`) gracefully on Ctrl+C or `SIGTERM`: runs `stop` (e.g. to close the
 * connection and finish saving the tokens), then exits, which prints the "Done" line. A second signal quits right away
 * (cancelled: exit code 130 for SIGINT, 143 for SIGTERM).
 *
 * @param stop What to do before exiting
 * @param onStopping Called when the first signal arrives (e.g. to tell how to force-quit)
 * @param proc The process (to test it)
 */
export function stopGracefully(
  stop: () => Promise<unknown>,
  onStopping: () => void = () => {},
  proc: SignalledProcess = process,
) {
  let stopping = false;
  const handler = (signal: "SIGINT" | "SIGTERM") => {
    if (stopping) {
      proc.exit(CANCELLED_EXIT_CODES[signal]);
      return;
    }
    stopping = true;
    onStopping();
    void (async () => {
      try {
        await stop();
      } catch {
        // Exit anyway
      }
      proc.exit();
    })();
  };
  proc.on("SIGINT", () => handler("SIGINT"));
  proc.on("SIGTERM", () => handler("SIGTERM"));
}
