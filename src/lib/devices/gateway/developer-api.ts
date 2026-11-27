import EventEmitter from "node:events";
import dgram from "node:dgram";
import os from "node:os";

const MULTICAST_ADDRESS = "224.0.0.50";
const MULTICAST_PORT = 4321;

const SERVER_PORT = 9898;

/** The properties of the gateway (`id: "0"`) or of one of its sub-devices (its `sid`) */
export interface PropertiesChanged {
  id: string;
  data: Record<string, unknown>;
}

interface DeveloperApiEvents {
  ready: [];
  error: [error: Error];
  propertiesChanged: [event: PropertiesChanged];
  /** `properties:<sid>`: the properties of a sub-device */
  [properties: `properties:${string}`]: [data: Record<string, unknown>];
}

/** A message of the developer API */
interface Message {
  cmd: string;
  ip?: string;
  port?: number;
  sid?: string;
  model?: string;
  /** JSON-encoded properties */
  data?: string;
}

/**
 * Local Developer API for the gateway. Used to read data from the gateway
 * and connected devices.
 *
 * TODO: Retries for discovery
 */
export default class DeveloperApi extends EventEmitter<DeveloperApiEvents> {
  readonly address: string;
  port = SERVER_PORT;
  /** The sid of the gateway, once it answered */
  sid?: string;
  private readonly debug: (...msgs: unknown[]) => void;
  private readonly socket: dgram.Socket;

  constructor(
    parent: { debug: (...msgs: unknown[]) => void },
    address: string,
  ) {
    super();

    this.address = address;

    // Call the parent's debug when logging: it isn't ready (no id) before the gateway is initialized
    this.debug = (...msgs) => parent.debug(...msgs);

    this.socket = dgram.createSocket({
      type: "udp4",
      reuseAddr: true,
    });

    this.socket.on("message", (msg) => this.onMessage(msg));
    this.socket.on("listening", () => {
      // Add membership to the multicast addresss for all network interfaces
      for (const addresses of Object.values(os.networkInterfaces())) {
        for (const addr of addresses ?? []) {
          if (addr.family === "IPv4") {
            this.socket.addMembership(MULTICAST_ADDRESS, addr.address);
          }
        }
      }

      // Broadcast a whois to find all gateways
      const json = JSON.stringify({
        cmd: "whois",
      });
      this.debug("DEV BROADCAST ->", json);
      this.socket.send(json, 0, json.length, MULTICAST_PORT, MULTICAST_ADDRESS);

      // Give us one second to discover the gateway
      setTimeout(() => {
        this.debug("DEV <- Timeout for whois");
        this.emit("ready");
      }, 1000);
    });
    this.socket.bind({
      port: SERVER_PORT,
      exclusive: true,
    });
  }

  destroy() {
    this.socket.close();
  }

  send(data: Record<string, unknown>) {
    const json = JSON.stringify(data);
    this.debug("DEV ->", json);

    this.socket.send(json, 0, json.length, this.port, this.address);
  }

  read(sid: string) {
    this.send({
      cmd: "read",
      sid: sid,
    });
  }

  private onMessage(msg: Buffer) {
    let data: Message;
    try {
      this.debug("DEV <-", msg.toString());
      data = JSON.parse(msg.toString());
    } catch (ex) {
      this.emit("error", ex as Error);
      return;
    }

    switch (data.cmd) {
      case "iam":
        if (data.ip === this.address) {
          this.port = data.port ?? this.port;
          this.sid = data.sid;

          this.emit("ready");
        }
        break;
      case "read_ack":
      case "heartbeat":
      case "report": {
        if (!this.sid && data.model === "gateway") {
          this.sid = data.sid;
        }

        const parsed = JSON.parse(data.data ?? "{}") as Record<string, unknown>;
        this.emit("propertiesChanged", {
          id: this.sid === data.sid ? "0" : String(data.sid),
          data: parsed,
        });

        this.emit(`properties:${data.sid}`, parsed);
      }
    }
  }
}
