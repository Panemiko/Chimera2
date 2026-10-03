import { EventEmitter } from "node:events";

export type CanvasSceneMessage = {
  from: string;
  elements: unknown[];
  files: Record<string, unknown>;
};

export type CanvasPointerMessage = {
  from: string;
  userName: string;
  userColor: string;
  x: number;
  y: number;
  tool: "pointer" | "laser";
  button: "up" | "down";
};

export type CanvasPresence = {
  userId: string;
  userName: string;
  userColor: string;
  inPrivate: boolean;
  lastSeen: number;
};

export const canvasBus = new EventEmitter();
canvasBus.setMaxListeners(100);

export function canvasChannel(roomId: string) {
  return `canvas:${roomId}`;
}

const presenceByRoom = new Map<string, Map<string, CanvasPresence>>();
const PRESENCE_TTL_MS = 45000;

export function touchPresence(roomId: string, entry: Omit<CanvasPresence, "lastSeen">) {
  let room = presenceByRoom.get(roomId);
  if (!room) {
    room = new Map();
    presenceByRoom.set(roomId, room);
  }
  room.set(entry.userId, { ...entry, lastSeen: Date.now() });
  prunePresence(roomId);
}

export function leavePresence(roomId: string, userId: string) {
  presenceByRoom.get(roomId)?.delete(userId);
}

function prunePresence(roomId: string) {
  const room = presenceByRoom.get(roomId);
  if (!room) return;
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  for (const [id, p] of room) {
    if (p.lastSeen < cutoff) room.delete(id);
  }
}

export function listPresence(roomId: string): CanvasPresence[] {
  prunePresence(roomId);
  return [...(presenceByRoom.get(roomId)?.values() ?? [])];
}
