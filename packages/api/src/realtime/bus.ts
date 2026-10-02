import { EventEmitter } from "events";

export type RoomEventData = {
  id: number;
  roomId: string;
  actorId: string | null;
  type: string;
  secret: boolean;
  payload: unknown;
  createdAt: Date;
};

export function roomChannel(roomId: string) {
  return `room:${roomId}`;
}

export const roomBus = new EventEmitter();

roomBus.setMaxListeners(0);

export function publishRoomEvent(event: RoomEventData) {
  roomBus.emit(roomChannel(event.roomId), event);
}

export function canSeeEvent(
  role: "master" | "player",
  userId: string,
  event: Pick<RoomEventData, "secret" | "actorId">,
) {
  return role === "master" || !event.secret || event.actorId === userId;
}
