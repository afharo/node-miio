/*
 * Parser of the map files of the Roborock vacuums (the "RRMap" format, downloaded from the Xiaomi Cloud).
 *
 * Ported from Xiaomi-Cloud-Map-Extractor (https://github.com/PiotrMachowski/Home-Assistant-custom-components-Xiaomi-Cloud-Map-Extractor)
 * Copyright (c) 2020 Piotr Machowski. Licensed under the MIT License.
 */
import { gunzipSync } from "node:zlib";

/** A pixel of the map image is 50mm (the map coordinates are in mm) */
export const MM_PER_PIXEL = 50;

/** Pixel values of the map image */
export const PIXEL = {
  OUTSIDE: 0x00,
  WALL: 0x01,
  INSIDE: 0xff,
  SCAN: 0x07,
} as const;

/** The block types of the map file */
const BLOCK = {
  CHARGER: 1,
  IMAGE: 2,
  PATH: 3,
  GOTO_PATH: 4,
  GOTO_PREDICTED_PATH: 5,
  CURRENTLY_CLEANED_ZONES: 6,
  GOTO_TARGET: 7,
  ROBOT_POSITION: 8,
  NO_GO_AREAS: 9,
  VIRTUAL_WALLS: 10,
  NO_MOPPING_AREAS: 12,
  DIGEST: 1024,
} as const;

/** A point in map coordinates (mm) */
export interface MapPoint {
  x: number;
  y: number;
  /** The orientation in degrees, when known */
  angle?: number;
}

/** A rectangle in map coordinates (mm) */
export interface MapRectangle {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A room (segment) of the map */
export interface MapRoom extends MapRectangle {
  /** The segment ID, as used by `get_room_mapping` and `app_segment_clean` */
  id: number;
}

/** A quadrilateral area (no-go and no-mopping areas) */
export type MapArea = [MapPoint, MapPoint, MapPoint, MapPoint];

export interface MapImage {
  /** The position of the image in the map, in pixels */
  top: number;
  left: number;
  width: number;
  height: number;
  /** One byte per pixel, row by row (see {@link PIXEL} and {@link roomOfPixel}) */
  pixels: Uint8Array;
}

export interface RoborockMap {
  majorVersion: number;
  minorVersion: number;
  mapIndex: number;
  mapSequence: number;
  /** Whether the file has a digest block (complete file) */
  isValid: boolean;
  image?: MapImage;
  rooms: MapRoom[];
  robot?: MapPoint;
  charger?: MapPoint;
  path: MapPoint[];
  gotoPath: MapPoint[];
  gotoPredictedPath: MapPoint[];
  gotoTarget?: MapPoint;
  zones: MapRectangle[];
  noGoAreas: MapArea[];
  noMoppingAreas: MapArea[];
  virtualWalls: MapRectangle[];
  /** The room the robot is in, if it's inside one */
  currentRoom?: number;
}

/** The map file couldn't be parsed */
export class MapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapParseError";
  }
}

/**
 * @param value A pixel of the map image
 * @returns The room (segment ID) of the pixel, if it belongs to a room
 */
export function roomOfPixel(value: number): number | undefined {
  if (value === PIXEL.INSIDE || value === PIXEL.SCAN) return undefined;
  return (value & 0x07) === 7 ? (value & 0xff) >> 3 : undefined;
}

/**
 * @param map The parsed map
 * @param point A point in map coordinates (mm)
 * @returns The room (segment ID) at that point, if any
 */
export function roomAt(
  map: Pick<RoborockMap, "image">,
  point: MapPoint,
): number | undefined {
  const image = map.image;
  if (!image) return undefined;
  const x = Math.round(point.x / MM_PER_PIXEL - image.left);
  const y = Math.round(point.y / MM_PER_PIXEL - image.top);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return undefined;
  return roomOfPixel(image.pixels[x + image.width * y]);
}

/**
 * Parses a Roborock map file.
 *
 * @param file The map file, gzipped (as downloaded) or not
 * @returns The map
 */
export function parseRoborockMap(file: Buffer): RoborockMap {
  const raw =
    file[0] === 0x1f && file[1] === 0x8b ? gunzipSync(file) : Buffer.from(file);
  if (raw.length < 0x14 || raw.toString("latin1", 0, 2) !== "rr") {
    throw new MapParseError("Not a Roborock map file");
  }
  const map: RoborockMap = {
    majorVersion: raw.readUInt16LE(0x08),
    minorVersion: raw.readUInt16LE(0x0a),
    mapIndex: raw.readUInt32LE(0x0c),
    mapSequence: raw.readUInt32LE(0x10),
    isValid: false,
    rooms: [],
    path: [],
    gotoPath: [],
    gotoPredictedPath: [],
    zones: [],
    noGoAreas: [],
    noMoppingAreas: [],
    virtualWalls: [],
  };

  let position = raw.readUInt16LE(0x02);
  while (position + 8 <= raw.length) {
    const headerLength = raw.readUInt16LE(position + 0x02);
    const dataLength = raw.readUInt32LE(position + 0x04);
    const type = raw.readUInt16LE(position);
    const dataStart = position + headerLength;
    if (headerLength < 8 || dataStart + dataLength > raw.length) {
      throw new MapParseError(`Truncated block ${type} at ${position}`);
    }
    const header = raw.subarray(position, dataStart);
    const data = raw.subarray(dataStart, dataStart + dataLength);
    const pairs = headerLength >= 0x0a ? header.readUInt16LE(0x08) : 0;

    switch (type) {
      case BLOCK.CHARGER:
        map.charger = parsePosition(data);
        break;
      case BLOCK.ROBOT_POSITION:
        map.robot = parsePosition(data);
        break;
      case BLOCK.IMAGE:
        map.image = parseImage(header, data);
        break;
      case BLOCK.PATH:
        map.path = parsePath(data);
        break;
      case BLOCK.GOTO_PATH:
        map.gotoPath = parsePath(data);
        break;
      case BLOCK.GOTO_PREDICTED_PATH:
        map.gotoPredictedPath = parsePath(data);
        break;
      case BLOCK.GOTO_TARGET:
        map.gotoTarget = { x: data.readUInt16LE(0), y: data.readUInt16LE(2) };
        break;
      case BLOCK.CURRENTLY_CLEANED_ZONES:
        map.zones = parseRectangles(data, pairs);
        break;
      case BLOCK.VIRTUAL_WALLS:
        map.virtualWalls = parseRectangles(data, pairs);
        break;
      case BLOCK.NO_GO_AREAS:
        map.noGoAreas = parseAreas(data, pairs);
        break;
      case BLOCK.NO_MOPPING_AREAS:
        map.noMoppingAreas = parseAreas(data, pairs);
        break;
      case BLOCK.DIGEST:
        map.isValid = true;
        break;
      default:
        // Other blocks (obstacles, carpets, mop path…) aren't needed yet
        break;
    }
    // Like the reference implementation: the header length is read as a single byte here
    position += dataLength + header[2];
  }

  if (map.image) {
    map.rooms = findRooms(map.image);
    if (map.robot) map.currentRoom = roomAt(map, map.robot);
  }
  return map;
}

/**
 * @param data The block data
 * @returns The position (and orientation, if present)
 */
function parsePosition(data: Buffer): MapPoint {
  const point: MapPoint = { x: data.readUInt32LE(0), y: data.readUInt32LE(4) };
  if (data.length >= 12) {
    let angle = data.readUInt32LE(8);
    if (angle > 0xff) angle = (angle & 0xff) - 256;
    point.angle = angle;
  }
  return point;
}

/**
 * @param header The block header (the last 16 bytes are top, left, height and width)
 * @param data The pixels
 * @returns The image
 */
function parseImage(header: Buffer, data: Buffer): MapImage {
  const end = header.length;
  const image: MapImage = {
    top: header.readUInt32LE(end - 16),
    left: header.readUInt32LE(end - 12),
    height: header.readUInt32LE(end - 8),
    width: header.readUInt32LE(end - 4),
    pixels: new Uint8Array(data),
  };
  if (image.width * image.height > data.length) {
    throw new MapParseError("The image is smaller than its size");
  }
  return image;
}

/**
 * @param data The block data (int16 x/y pairs)
 * @returns The path points
 */
function parsePath(data: Buffer): MapPoint[] {
  const points: MapPoint[] = [];
  for (let i = 0; i + 4 <= data.length; i += 4) {
    points.push({ x: data.readUInt16LE(i), y: data.readUInt16LE(i + 2) });
  }
  return points;
}

/**
 * @param data The block data
 * @param count The number of rectangles
 * @returns The rectangles (zones, virtual walls)
 */
function parseRectangles(data: Buffer, count: number): MapRectangle[] {
  const rectangles: MapRectangle[] = [];
  for (let i = 0; i < count && (i + 1) * 8 <= data.length; i++) {
    rectangles.push({
      x0: data.readUInt16LE(i * 8),
      y0: data.readUInt16LE(i * 8 + 2),
      x1: data.readUInt16LE(i * 8 + 4),
      y1: data.readUInt16LE(i * 8 + 6),
    });
  }
  return rectangles;
}

/**
 * @param data The block data
 * @param count The number of areas
 * @returns The areas (4 points each)
 */
function parseAreas(data: Buffer, count: number): MapArea[] {
  const areas: MapArea[] = [];
  for (let i = 0; i < count && (i + 1) * 16 <= data.length; i++) {
    const point = (n: number) => ({
      x: data.readUInt16LE(i * 16 + n * 4),
      y: data.readUInt16LE(i * 16 + n * 4 + 2),
    });
    areas.push([point(0), point(1), point(2), point(3)]);
  }
  return areas;
}

/**
 * @param image The map image
 * @returns The rooms found in the image, with their bounding box in map coordinates
 */
function findRooms(image: MapImage): MapRoom[] {
  const boxes = new Map<number, [number, number, number, number]>();
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const room = roomOfPixel(image.pixels[x + image.width * y]);
      if (room === undefined) continue;
      const box = boxes.get(room);
      if (!box) {
        boxes.set(room, [x, y, x, y]);
      } else {
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x);
        box[3] = Math.max(box[3], y);
      }
    }
  }
  return [...boxes]
    .sort(([a], [b]) => a - b)
    .map(([id, [x0, y0, x1, y1]]) => ({
      id,
      x0: (x0 + image.left) * MM_PER_PIXEL,
      y0: (y0 + image.top) * MM_PER_PIXEL,
      x1: (x1 + image.left) * MM_PER_PIXEL,
      y1: (y1 + image.top) * MM_PER_PIXEL,
    }));
}
