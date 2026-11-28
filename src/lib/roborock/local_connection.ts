import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import net from "node:net";

import { createDebug, type MiioLogger } from "../logger.js";

import { RoborockError } from "./errors.js";
import {
  decodeMessage,
  encodeMessage,
  LengthPrefixedReader,
  RoborockProtocol,
  rpcPayload,
  rpcResponse,
  rpcResult,
  withLengthPrefix,
  type L01Nonces,
  type RoborockMessage,
  type RoborockMessageVersion,
} from "./message.js";

/** The TCP port of the robots' local API */
export const ROBOROCK_LOCAL_PORT = 58867;

const PING_INTERVAL_MS = 10_000;
/** How long to wait for the answer to a hello before trying the other protocol version */
const HELLO_TIMEOUT_MS = 4_000;

export interface RoborockLocalConnectionOptions {
  /** The robot's IP address */
  address: string;
  /** The robot's local key (from the account's home data) */
  localKey: string;
  /** Default {@link ROBOROCK_LOCAL_PORT} */
  port?: number;
  /** Timeout of the connection and of each request (default 10s) */
  timeoutMs?: number;
  /**
   * The local protocol version to try first. Robots speak `1.0` or `L01` locally, which may differ from the
   * protocol version of the home data: both are tried, and the one that works is remembered.
   */
  protocolVersion?: RoborockMessageVersion;
  logger?: MiioLogger;
}

/** Unix time in seconds */
const now = () => Math.floor(Date.now() / 1000);
const randomInt = (min: number, max: number) => crypto.randomInt(min, max);

interface Session {
  socket: net.Socket;
  version: RoborockMessageVersion;
  nonces: L01Nonces;
  reader: LengthPrefixedReader;
}

/**
 * A local connection to a Roborock robot, over TCP port 58867 (local protocols `1.0` and `L01`).
 *
 * Events: `message` (every message received, e.g. status pushes), `close`.
 */
export class RoborockLocalConnection extends EventEmitter {
  private session?: Session;
  private readonly waiting = new Set<(message: RoborockMessage) => boolean>();
  private pingTimer?: NodeJS.Timeout;
  private connecting?: Promise<void>;
  private preferredVersion?: RoborockMessageVersion;
  private readonly debug;
  private seq = 1;

  /** @returns The next message sequence number (the hello is 1) */
  private nextSeq() {
    this.seq = this.seq >= 0x7fffffff ? 2 : this.seq + 1;
    return this.seq;
  }

  constructor(private readonly options: RoborockLocalConnectionOptions) {
    super();
    this.preferredVersion = options.protocolVersion;
    this.debug = createDebug(
      `miio:roborock:local:${options.address}`,
      () => options.logger,
    );
  }

  /** Whether the connection is open and the robot answered the hello */
  get connected() {
    return Boolean(
      this.session && !this.session.socket.destroyed && !this.connecting,
    );
  }

  /** The local protocol version the robot answered to (`undefined` until connected) */
  get protocolVersion() {
    return this.session?.version ?? this.preferredVersion;
  }

  private get timeoutMs() {
    return this.options.timeoutMs ?? 10_000;
  }

  /**
   * Connects (if not connected yet) and says hello to the robot.
   */
  async connect(): Promise<void> {
    if (this.connected) return;
    this.connecting ??= this.open().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  private async open() {
    const versions: RoborockMessageVersion[] =
      this.preferredVersion === "L01" ? ["L01", "1.0"] : ["1.0", "L01"];
    for (const version of versions) {
      const socket = await this.openSocket();
      const session: Session = {
        socket,
        version,
        nonces: { connectNonce: randomInt(10000, 32767) },
        reader: new LengthPrefixedReader(),
      };
      this.seq = 1;
      this.session = session;
      socket.on("data", (chunk) => this.onData(session, chunk));
      socket.on("error", (err) => this.debug(`Socket error: ${err.message}`));
      socket.on("close", () => this.onClose(session));
      try {
        const response = await this.request(
          {
            version,
            seq: 1,
            random: session.nonces.connectNonce,
            timestamp: now(),
            protocol: RoborockProtocol.HELLO_REQUEST,
          },
          (m) =>
            m.protocol === RoborockProtocol.HELLO_RESPONSE &&
            m.version === version,
          Math.min(this.timeoutMs, HELLO_TIMEOUT_MS),
        );
        session.nonces.ackNonce = response.random;
        this.preferredVersion = version;
        this.debug(`Connected (local protocol ${version})`);
        this.startPing();
        return;
      } catch (err) {
        this.debug(
          `No answer to the ${version} hello: ${(err as Error).message}`,
        );
        this.session = undefined;
        socket.destroy();
      }
    }
    throw new RoborockError(
      `The robot at ${this.options.address} didn't answer the hello (local protocols 1.0 and L01)`,
    );
  }

  private openSocket() {
    return new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect({
        host: this.options.address,
        port: this.options.port ?? ROBOROCK_LOCAL_PORT,
        timeout: this.timeoutMs,
      });
      s.once("connect", () => {
        s.setTimeout(0);
        resolve(s);
      });
      s.once("timeout", () => {
        s.destroy();
        reject(
          new RoborockError(
            `Couldn't connect to ${this.options.address}: timed out`,
          ),
        );
      });
      s.once("error", (err) =>
        reject(
          new RoborockError(
            `Couldn't connect to ${this.options.address}: ${err.message}`,
          ),
        ),
      );
    });
  }

  private startPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      const version = this.session?.version;
      if (!version) return;
      this.request(
        {
          version,
          seq: this.nextSeq(),
          random: randomInt(10000, 99999),
          timestamp: now(),
          protocol: RoborockProtocol.PING_REQUEST,
        },
        (m) => m.protocol === RoborockProtocol.PING_RESPONSE,
      ).catch((err) => {
        this.debug(`Ping failed, closing: ${err.message}`);
        this.close();
      });
    }, PING_INTERVAL_MS);
    this.pingTimer.unref?.();
  }

  private onData(session: Session, chunk: Buffer) {
    for (const frame of session.reader.push(chunk)) {
      let message: RoborockMessage;
      try {
        message = decodeMessage(frame, this.options.localKey, session.nonces);
      } catch (err) {
        this.debug(`Ignoring a message: ${(err as Error).message}`);
        continue;
      }
      for (const matcher of this.waiting) {
        if (matcher(message)) this.waiting.delete(matcher);
      }
      this.emit("message", message);
    }
  }

  private onClose(session: Session) {
    if (this.session !== session) return;
    this.debug("Disconnected");
    clearInterval(this.pingTimer);
    this.session = undefined;
    this.emit("close");
  }

  /**
   * Sends a message and waits for the first received message that matches.
   *
   * @param message The message to send
   * @param matches Whether a received message is the response
   * @param timeoutMs How long to wait for the response
   * @returns The response
   */
  private request(
    message: RoborockMessage,
    matches: (message: RoborockMessage) => boolean,
    timeoutMs = this.timeoutMs,
  ): Promise<RoborockMessage> {
    const session = this.session;
    if (!session || session.socket.destroyed) {
      return Promise.reject(new RoborockError("Not connected"));
    }
    return new Promise<RoborockMessage>((resolve, reject) => {
      const matcher = (received: RoborockMessage) => {
        if (!matches(received)) return false;
        clearTimeout(timer);
        resolve(received);
        return true;
      };
      const timer = setTimeout(() => {
        this.waiting.delete(matcher);
        reject(new RoborockError(`No response after ${timeoutMs} ms`));
      }, timeoutMs);
      this.waiting.add(matcher);
      session.socket.write(
        withLengthPrefix(
          encodeMessage(message, this.options.localKey, session.nonces),
        ),
      );
    });
  }

  /**
   * Calls a method on the robot (the same methods as miIO: `get_status`, `app_start`…).
   *
   * @param method The method
   * @param params The params
   * @returns The result
   */
  async call<T = unknown>(method: string, params: unknown = []): Promise<T> {
    await this.connect();
    const version = this.session?.version ?? "1.0";
    const id = randomInt(10000, 32767);
    const timestamp = now();
    this.debug(`-> ${method} (${id})`, JSON.stringify(params));
    const response = await this.request(
      {
        version,
        seq: this.nextSeq(),
        random: randomInt(10000, 99999),
        timestamp,
        protocol: RoborockProtocol.GENERAL_REQUEST,
        payload: rpcPayload({ id, method, params }, timestamp),
      },
      (m) => rpcResponse(m)?.id === id,
    );
    // The matcher only accepts messages with an RPC response
    const rpc = rpcResponse(response) as NonNullable<
      ReturnType<typeof rpcResponse>
    >;
    this.debug(`<- ${method} (${id})`, JSON.stringify(rpc.result ?? rpc.error));
    return rpcResult<T>(method, rpc);
  }

  /** Closes the connection */
  close() {
    clearInterval(this.pingTimer);
    for (const matcher of this.waiting) this.waiting.delete(matcher);
    this.session?.socket.destroy();
  }
}
