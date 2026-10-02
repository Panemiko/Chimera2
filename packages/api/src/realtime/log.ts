import type { Database } from "@chimera2/db";
import { roomEvent } from "@chimera2/db/schema/room-events";

import { publishRoomEvent, type RoomEventData } from "./bus";

export type NewRoomEvent = {
  roomId: string;
  actorId: string | null;
  type: string;
  secret?: boolean;
  payload: unknown;
};

export function toRoomEventData(row: typeof roomEvent.$inferSelect): RoomEventData {
  return {
    id: row.id,
    roomId: row.roomId,
    actorId: row.actorId,
    type: row.type,
    secret: row.secret,
    payload: JSON.parse(row.payload) as unknown,
    createdAt: row.createdAt,
  };
}

export async function logRoomEvent(db: Database, input: NewRoomEvent): Promise<RoomEventData> {
  const [row] = await db
    .insert(roomEvent)
    .values({
      roomId: input.roomId,
      actorId: input.actorId,
      type: input.type,
      secret: input.secret ?? false,
      payload: JSON.stringify(input.payload),
    })
    .returning();
  if (!row) {
    throw new Error("Failed to log room event");
  }
  const event = toRoomEventData(row);
  publishRoomEvent(event);
  return event;
}
