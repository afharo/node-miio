import type { RoborockHomeData } from "./web_api";

export interface RoborockRoom {
  /** The segment ID on the map (what `cleanRooms` takes) */
  segmentId: number;
  /** The room ID in the account */
  roomId: string;
  /** The name given in the Roborock app (`undefined` if unknown) */
  name?: string;
}

/**
 * Names the rooms of the map. `get_room_mapping` maps segments to the account's room IDs, and the home data names them.
 *
 * @param mapping The response of `get_room_mapping` (`[[segmentId, roomId, …], …]`)
 * @param rooms The rooms of the home data
 * @returns The rooms of the map with their names
 */
export function roomNames(
  mapping: unknown,
  rooms: RoborockHomeData["rooms"],
): RoborockRoom[] {
  const names = new Map(rooms.map((room) => [String(room.id), room.name]));
  if (!Array.isArray(mapping)) return [];
  return mapping
    .filter((entry): entry is [number, string | number] => Array.isArray(entry))
    .map(([segmentId, roomId]) => ({
      segmentId: Number(segmentId),
      roomId: String(roomId),
      name: names.get(String(roomId)),
    }));
}
