import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import {
  MapParseError,
  MM_PER_PIXEL,
  parseRoborockMap,
  roomAt,
  roomOfPixel,
} from "./roborock_map";

const FIXTURES = path.join(__dirname, "../__fixtures__/maps/roborock");
const load = (name: string) =>
  fs.readFileSync(path.join(FIXTURES, `${name}.bin.gz`));

/** Room bounding boxes in pixels, as reported by Valetudo for the same files */
const pixelBoxes = (map: ReturnType<typeof parseRoborockMap>) =>
  Object.fromEntries(
    map.rooms.map((r) => [r.id, [r.x0 / MM_PER_PIXEL, r.x1 / MM_PER_PIXEL]]),
  );

describe("parseRoborockMap (real maps, cross-checked with Valetudo)", () => {
  test("S6 with segments: rooms, robot, charger, current room", () => {
    const map = parseRoborockMap(
      load("S6_FW2652_with_active_segment_and_no_mop_zone"),
    );
    expect(map.isValid).toBe(true);
    expect(pixelBoxes(map)).toStrictEqual({
      16: [591, 609],
      17: [580, 662],
      18: [611, 695],
      19: [501, 579],
      20: [503, 563],
      21: [667, 706],
    });
    // Valetudo: robot [3055, 2475] and charger [2527, 2560] (cm, with the Y axis flipped)
    expect(map.robot).toMatchObject({ x: 30550, y: 26455 });
    expect(51200 - (map.robot?.y ?? 0)).toBeCloseTo(24745);
    expect(map.charger).toMatchObject({ x: 25273, y: 25603 });
    // Valetudo marks segment 17 as active: the robot is cleaning it
    expect(map.currentRoom).toBe(17);
    expect(map.path).toHaveLength(78);
    expect(map.noGoAreas).toHaveLength(1);
    expect(map.noMoppingAreas).toHaveLength(1);
  });

  test("S8: rooms and current room", () => {
    const map = parseRoborockMap(load("S8_FW1286_with_obstacles"));
    expect(pixelBoxes(map)).toStrictEqual({
      2: [410, 468],
      3: [422, 500],
      16: [543, 609],
      17: [467, 527],
      18: [556, 614],
      19: [506, 557],
    });
    expect(map.robot).toMatchObject({ x: 26042, y: 25597 });
    expect(map.currentRoom).toBe(17);
    expect(map.path).toHaveLength(751);
  });

  test("S5 (map format v1.1)", () => {
    const map = parseRoborockMap(load("S5_FW2008_with_segments"));
    expect([map.majorVersion, map.minorVersion]).toStrictEqual([1, 1]);
    expect(pixelBoxes(map)).toStrictEqual({ 1: [465, 531], 2: [503, 532] });
    expect(map.currentRoom).toBe(1);
    expect(map.path).toHaveLength(933);
  });

  test("old firmware without segments: no rooms, but zones and restrictions", () => {
    const map = parseRoborockMap(
      load(
        "S5_FW1886_with_forbidden_zones_and_virtual_walls_and_currently_cleaned_zones",
      ),
    );
    expect(map.rooms).toStrictEqual([]);
    expect(map.currentRoom).toBeUndefined();
    expect(map.robot).toMatchObject({ x: 28697, y: 26764 });
    expect(map.path).toHaveLength(55);
    expect(map.noGoAreas).toHaveLength(1);
    expect(map.virtualWalls).toHaveLength(1);
    expect(map.zones).toHaveLength(1);
  });

  test("accepts uncompressed files", () => {
    const raw = gunzipSync(load("S8_FW1286_with_obstacles"));
    expect(parseRoborockMap(raw).currentRoom).toBe(17);
  });

  test("rejects other files", () => {
    expect(() => parseRoborockMap(Buffer.from("not a map at all"))).toThrow(
      MapParseError,
    );
    const truncated = gunzipSync(load("S8_FW1286_with_obstacles")).subarray(
      0,
      200,
    );
    expect(() => parseRoborockMap(truncated)).toThrow(MapParseError);
  });
});

describe("roomAt / roomOfPixel", () => {
  const map = parseRoborockMap(load("S8_FW1286_with_obstacles"));

  test("the room of a point", () => {
    expect(roomAt(map, map.robot ?? { x: 0, y: 0 })).toBe(17);
    // Outside the image
    expect(roomAt(map, { x: 0, y: 0 })).toBeUndefined();
    expect(roomAt({}, { x: 26042, y: 25597 })).toBeUndefined();
  });

  test("pixel values", () => {
    expect(roomOfPixel(0xff)).toBeUndefined(); // inside, no room
    expect(roomOfPixel(0x07)).toBeUndefined(); // scanned
    expect(roomOfPixel(0x00)).toBeUndefined(); // outside
    expect(roomOfPixel(0x01)).toBeUndefined(); // wall
    expect(roomOfPixel((17 << 3) | 7)).toBe(17);
  });
});
