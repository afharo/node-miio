import { EventEmitter } from "node:events";

import debugFactory from "debug";

import type { CloudServer, XiaomiCloud } from "../cloud/client";
import { CloudSessionExpiredError } from "../cloud/errors";

import type { MapPoint, RoborockMap } from "./roborock_map";

const debug = debugFactory("miio:map-watcher");

/** What the watcher needs from the vacuum (e.g. a Roborock {@link Vacuum}) */
export interface MapWatcherDevice {
  getCloudMap(
    cloud: Pick<XiaomiCloud, "getMapFileUrl" | "download">,
    server: CloudServer | string,
  ): Promise<RoborockMap>;
  cleaning(): Promise<boolean>;
  on(event: "cleaningChanged", listener: (cleaning: boolean) => void): unknown;
  off(event: "cleaningChanged", listener: (cleaning: boolean) => void): unknown;
}

export interface MapWatcherOptions {
  /** The server the device is registered in (see {@link XiaomiCloud.findDevice}) */
  server: CloudServer | string;
  /** How often to download the map while cleaning (default 10s, minimum 5s) */
  intervalMs?: number;
  /** The longest wait after consecutive errors (default 5 minutes) */
  maxBackoffMs?: number;
}

export interface MapWatcherEvents {
  /** A new map was downloaded */
  map: [RoborockMap];
  /** The robot moved to another room, or left the rooms (`undefined`), e.g. when it stops cleaning */
  currentRoom: [number | undefined];
  /** The robot moved */
  position: [MapPoint | undefined];
  /** The map couldn't be downloaded. With {@link CloudSessionExpiredError}, the watcher stops polling */
  failed: [Error];
}

const MIN_INTERVAL_MS = 5_000;

/**
 * Downloads the vacuum's map from the Xiaomi Cloud while it's cleaning, to report the room it's in.
 *
 * ```ts
 * const watcher = new MapWatcher(vacuum, cloud, { server: "de" });
 * watcher.on("currentRoom", (room) => console.log("Now in room", room));
 * await watcher.start();
 * ```
 */
export class MapWatcher extends EventEmitter<MapWatcherEvents> {
  private readonly intervalMs: number;
  private readonly maxBackoffMs: number;
  private timer?: NodeJS.Timeout;
  private polling = false;
  private started = false;
  private failures = 0;
  private lastRoom?: number;
  private lastPosition?: MapPoint;

  constructor(
    private readonly device: MapWatcherDevice,
    private readonly cloud: Pick<XiaomiCloud, "getMapFileUrl" | "download">,
    private readonly options: MapWatcherOptions,
  ) {
    super();
    this.intervalMs = Math.max(options.intervalMs ?? 10_000, MIN_INTERVAL_MS);
    this.maxBackoffMs = options.maxBackoffMs ?? 5 * 60_000;
  }

  private readonly onCleaningChanged = (cleaning: boolean) => {
    if (cleaning) {
      this.startPolling();
    } else {
      this.stopPolling();
      // One last map: where it stopped (e.g. the dock). The robot isn't in a room while it doesn't clean
      void this.refresh().finally(() => this.updateRoom(undefined));
    }
  };

  /**
   * Starts following the vacuum: the map is downloaded while it's cleaning.
   */
  async start() {
    if (this.started) return;
    this.started = true;
    this.device.on("cleaningChanged", this.onCleaningChanged);
    if (await this.device.cleaning()) this.startPolling();
  }

  /**
   * Stops following the vacuum.
   */
  stop() {
    this.started = false;
    this.device.off("cleaningChanged", this.onCleaningChanged);
    this.stopPolling();
  }

  /**
   * Downloads the map once.
   *
   * @returns The map, or `undefined` if it failed (see the `failed` event)
   */
  async refresh(): Promise<RoborockMap | undefined> {
    try {
      const map = await this.device.getCloudMap(
        this.cloud,
        this.options.server,
      );
      this.failures = 0;
      this.emit("map", map);
      this.updatePosition(map.robot);
      this.updateRoom(map.currentRoom);
      return map;
    } catch (err) {
      this.failures++;
      debug(`Unable to get the map: ${err}`);
      if (err instanceof CloudSessionExpiredError) this.stopPolling();
      this.emit("failed", err as Error);
      return undefined;
    }
  }

  private startPolling() {
    if (this.polling) return;
    this.polling = true;
    this.failures = 0;
    void this.poll();
  }

  private stopPolling() {
    this.polling = false;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async poll() {
    await this.refresh();
    if (!this.polling) return;
    const delay =
      this.failures === 0
        ? this.intervalMs
        : Math.min(this.intervalMs * 2 ** this.failures, this.maxBackoffMs);
    this.timer = setTimeout(() => void this.poll(), delay);
  }

  private updateRoom(room: number | undefined) {
    if (room === this.lastRoom) return;
    this.lastRoom = room;
    this.emit("currentRoom", room);
  }

  private updatePosition(position: MapPoint | undefined) {
    if (
      position?.x === this.lastPosition?.x &&
      position?.y === this.lastPosition?.y
    ) {
      return;
    }
    this.lastPosition = position;
    this.emit("position", position);
  }
}
