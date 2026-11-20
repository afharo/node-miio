import util from "node:util";

import debugFactory from "debug";

/**
 * A logger that node-miio can send its debug messages to, e.g. the one provided by Homebridge or Matterbridge.
 * Only `debug` is used: node-miio doesn't log anything above that level.
 */
export interface MiioLogger {
  debug(message: string, ...args: unknown[]): void;
}

export type DebugFn = (...msgs: unknown[]) => void;

let globalLogger: MiioLogger | undefined;

/**
 * Sends node-miio's debug messages to a logger, in addition to the `debug` package (`DEBUG=miio*`, used by the CLI).
 *
 * This is the global logger, used for messages that aren't about a specific device (network, MIoT specs, cloud…).
 * Use the `logger` option of `device()` for the messages of a specific device.
 *
 * @param options The options
 * @param options.logger The logger, or `undefined` to stop sending messages to it
 */
export function configureLogging(options: { logger?: MiioLogger }) {
  globalLogger = options.logger;
}

/** Keys whose values are never logged */
const SECRET_KEYS =
  /"(token|passwd|password|ssecurity|serviceToken|localKey)"\s*:\s*"[^"]*"/g;

/**
 * Removes secrets (tokens, passwords) from a log message, so users can share their logs safely.
 *
 * @param message The message
 * @returns The message, with the secrets replaced by `***`
 */
export function redact(message: string): string {
  return message.replace(SECRET_KEYS, '"$1":"***"');
}

/**
 * Masks a token: only its first 4 characters are kept, enough to tell tokens apart.
 *
 * @param token The token as hex
 * @returns The masked token
 */
export function maskToken(token?: string): string {
  return token ? `${token.slice(0, 4)}***` : String(token);
}

/**
 * Creates a debug function that logs to the `debug` package under `namespace`, and to a {@link MiioLogger}:
 * the one returned by `getLogger` (e.g. the device's), or the global one (see {@link configureLogging}).
 *
 * @param namespace The `debug` namespace (e.g. `miio:network`)
 * @param getLogger Returns the logger to use instead of the global one, if any
 * @returns The debug function
 */
export function createDebug(
  namespace: string,
  getLogger?: () => MiioLogger | undefined,
): DebugFn {
  const debug = debugFactory(namespace);
  return (...msgs: unknown[]) => {
    const message = redact(util.format(...msgs));
    debug("%s", message);
    const logger = getLogger?.() ?? globalLogger;
    logger?.debug(`[${namespace}] ${message}`);
  };
}
