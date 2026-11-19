import { EventEmitter } from "node:events";

import { CloudSessionExpiredError } from "../cloud/errors";

import { MapWatcher, type MapWatcherDevice } from "./map_watcher";
import type { RoborockMap } from "./roborock_map";

jest.mock("debug", () => jest.fn().mockReturnValue(jest.fn()));

const cloud = { getMapFileUrl: jest.fn(), download: jest.fn() };

function mapAt(currentRoom: number | undefined, x = 1000): RoborockMap {
  return {
    majorVersion: 1,
    minorVersion: 0,
    mapIndex: 0,
    mapSequence: 0,
    isValid: true,
    rooms: [],
    robot: { x, y: 2000 },
    path: [],
    gotoPath: [],
    gotoPredictedPath: [],
    zones: [],
    noGoAreas: [],
    noMoppingAreas: [],
    virtualWalls: [],
    currentRoom,
  };
}

function createDevice(cleaning = false) {
  const events = new EventEmitter();
  const device = {
    getCloudMap: jest.fn(),
    cleaning: jest.fn().mockResolvedValue(cleaning),
    on: (event: string, listener: (cleaning: boolean) => void) =>
      events.on(event, listener),
    off: (event: string, listener: (cleaning: boolean) => void) =>
      events.off(event, listener),
    setCleaning: (value: boolean) => events.emit("cleaningChanged", value),
    listeners: () => events.listenerCount("cleaningChanged"),
  };
  return device as typeof device & MapWatcherDevice;
}

describe("MapWatcher", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("polls while cleaning and reports room changes (deduped)", async () => {
    const device = createDevice();
    device.getCloudMap
      .mockResolvedValueOnce(mapAt(16, 1000))
      .mockResolvedValueOnce(mapAt(16, 1100))
      .mockResolvedValueOnce(mapAt(17, 1200))
      .mockResolvedValue(mapAt(undefined, 1300)); // final map: at the dock
    const watcher = new MapWatcher(device, cloud, { server: "de" });
    const rooms: Array<number | undefined> = [];
    const positions: number[] = [];
    watcher.on("currentRoom", (room) => rooms.push(room));
    watcher.on("position", (p) => positions.push(p?.x ?? -1));

    await watcher.start();
    expect(device.getCloudMap).not.toHaveBeenCalled(); // not cleaning yet

    device.setCleaning(true);
    await jest.advanceTimersByTimeAsync(0);
    expect(device.getCloudMap).toHaveBeenCalledWith(cloud, "de");
    await jest.advanceTimersByTimeAsync(10_000);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(rooms).toStrictEqual([16, 17]);

    device.setCleaning(false);
    await jest.advanceTimersByTimeAsync(0);
    expect(rooms).toStrictEqual([16, 17, undefined]);
    expect(positions).toStrictEqual([1000, 1100, 1200, 1300]);

    // No more polling once it stopped cleaning
    const calls = device.getCloudMap.mock.calls.length;
    await jest.advanceTimersByTimeAsync(60_000);
    expect(device.getCloudMap).toHaveBeenCalledTimes(calls);
  });

  test("starts polling right away if it's already cleaning; stop() unsubscribes", async () => {
    const device = createDevice(true);
    device.getCloudMap.mockResolvedValue(mapAt(18));
    const watcher = new MapWatcher(device, cloud, {
      server: "de",
      intervalMs: 1000, // clamped to 5s
    });
    await watcher.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(device.getCloudMap).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(4_999);
    expect(device.getCloudMap).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(device.getCloudMap).toHaveBeenCalledTimes(2);

    watcher.stop();
    expect(device.listeners()).toBe(0);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(device.getCloudMap).toHaveBeenCalledTimes(2);
  });

  test("backs off after errors", async () => {
    const device = createDevice(true);
    device.getCloudMap.mockRejectedValue(new Error("network"));
    const watcher = new MapWatcher(device, cloud, { server: "de" });
    const failed = jest.fn();
    watcher.on("failed", failed);
    await watcher.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(failed).toHaveBeenCalledTimes(1);
    // 1 failure → 20s, 2 failures → 40s
    await jest.advanceTimersByTimeAsync(19_999);
    expect(failed).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(failed).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(40_000);
    expect(failed).toHaveBeenCalledTimes(3);
    watcher.stop();
  });

  test("an expired session stops the polling", async () => {
    const device = createDevice(true);
    device.getCloudMap.mockRejectedValue(new CloudSessionExpiredError());
    const watcher = new MapWatcher(device, cloud, { server: "de" });
    const failed = jest.fn();
    watcher.on("failed", failed);
    await watcher.start();
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0][0]).toBeInstanceOf(CloudSessionExpiredError);
  });
});
