/** The parts of `process` that {@link stopGracefully} uses */
interface SignalledProcess {
  on(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  exit(code?: number): never | void;
}

/** The exit code of a forced quit (128 + SIGINT), like shells use */
const FORCED_EXIT_CODE = 130;

/**
 * Stops a long-running command (e.g. `discover`) gracefully on Ctrl+C or `SIGTERM`: runs `stop` (e.g. to close the
 * connection and finish saving the tokens), then exits, which prints the "Done" line. A second signal quits right away.
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
  const handler = () => {
    if (stopping) {
      proc.exit(FORCED_EXIT_CODE);
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
  proc.on("SIGINT", handler);
  proc.on("SIGTERM", handler);
}
