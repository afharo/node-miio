import net from "node:net";

import {
  decodeMessage,
  encodeMessage,
  LengthPrefixedReader,
  RoborockProtocol,
  withLengthPrefix,
  type L01Nonces,
  type RoborockMessage,
} from "./message.js";

export const LOCAL_KEY = "abcdefghijklmnop";

/**
 * A fake robot on a local TCP server: answers the hello, pings and RPC calls (protocol 1.0).
 *
 * @param responses The result of each method (a function receives the params)
 * @returns The port, the received RPC requests, a way to push messages, and `close`
 */
export async function fakeRobot(
  responses: Record<string, unknown | ((params: unknown) => unknown)>,
) {
  const calls: { method: string; params: unknown }[] = [];
  const sockets = new Set<net.Socket>();
  const options = {
    answerHello: true,
    silent: false,
    /** The local protocols it answers to (the Saros 20 only answers L01) */
    versions: ["1.0", "L01"],
    /** Drop requests whose seq isn't higher than the previous one (like real robots) */
    dropReplays: true,
  };
  const helloVersions: string[] = [];
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    const reader = new LengthPrefixedReader();
    let nonces: L01Nonces | undefined;
    let lastSeq = 0;
    let robotSeq = 14897940;
    const send = (message: RoborockMessage) =>
      socket.write(withLengthPrefix(encodeMessage(message, LOCAL_KEY, nonces)));
    socket.on("data", (chunk) => {
      for (const frame of reader.push(chunk)) {
        const message = decodeMessage(frame, LOCAL_KEY, nonces);
        if (message.protocol !== RoborockProtocol.HELLO_REQUEST) {
          if (options.dropReplays && message.seq <= lastSeq) continue;
          lastSeq = message.seq;
        }
        const reply = { ...message, payload: undefined };
        if (message.protocol === RoborockProtocol.HELLO_REQUEST) {
          helloVersions.push(message.version);
          if (
            options.answerHello &&
            options.versions.includes(message.version)
          ) {
            nonces = { connectNonce: message.random, ackNonce: 4242 };
            lastSeq = message.seq;
            send({
              ...reply,
              protocol: RoborockProtocol.HELLO_RESPONSE,
              random: 4242,
            });
          }
        } else if (message.protocol === RoborockProtocol.PING_REQUEST) {
          send({ ...reply, protocol: RoborockProtocol.PING_RESPONSE });
        } else if (message.protocol === RoborockProtocol.GENERAL_REQUEST) {
          const request = JSON.parse(
            JSON.parse(String(message.payload)).dps["101"],
          );
          calls.push({ method: request.method, params: request.params });
          if (options.silent) continue;
          const response = responses[request.method];
          const body =
            response === undefined
              ? { id: request.id, result: "unknown_method" }
              : typeof response === "function"
                ? {
                    id: request.id,
                    ...(response as (p: unknown) => object)(request.params),
                  }
                : { id: request.id, result: response };
          // Like the real robots: an empty ack, then the result in a message of its own
          send({ ...reply, protocol: RoborockProtocol.GENERAL_RESPONSE });
          send({
            ...reply,
            seq: ++robotSeq,
            protocol: RoborockProtocol.GENERAL_REQUEST,
            payload: Buffer.from(
              JSON.stringify({
                dps: { "102": JSON.stringify(body) },
                t: message.timestamp,
              }),
            ),
          });
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    calls,
    options,
    helloVersions,
    /** Disconnects every client */
    drop: () => sockets.forEach((s) => s.destroy()),
    close: () =>
      new Promise<void>((resolve) => {
        sockets.forEach((s) => s.destroy());
        server.close(() => resolve());
      }),
  };
}
