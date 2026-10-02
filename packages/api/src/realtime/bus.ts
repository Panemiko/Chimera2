import { EventEmitter } from "events";

export type RoomMessage = {
  id: string;
  roomId: string;
  text: string;
  author: string;
  sentAt: string;
};

function roomEvent(roomId: string) {
  return `message:${roomId}`;
}

export const roomBus = new EventEmitter();

roomBus.setMaxListeners(0);

export function publishRoomMessage(message: RoomMessage) {
  roomBus.emit(roomEvent(message.roomId), message);
}
