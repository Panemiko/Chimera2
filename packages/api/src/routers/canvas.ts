import type { Database } from "@chimera2/db";
import { user } from "@chimera2/db/schema/auth";
import { room, roomMember } from "@chimera2/db/schema/rooms";
import { TRPCError } from "@trpc/server";
import { tracked } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { on } from "events";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  canvasBus,
  canvasChannel,
  leavePresence,
  listPresence,
  touchPresence,
  type CanvasPointerMessage,
  type CanvasSceneMessage,
} from "../realtime/canvas-bus";

async function getMembership(db: Database, roomId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(roomMember)
    .where(and(eq(roomMember.roomId, roomId), eq(roomMember.userId, userId)));
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this room" });
  }
  return membership;
}

async function getIdentity(db: Database, userId: string) {
  const [row] = await db
    .select({ name: user.name, color: user.color })
    .from(user)
    .where(eq(user.id, userId));
  return { name: row?.name ?? "?", color: row?.color ?? "#555" };
}

const sceneFile = z.object({}).catchall(z.unknown());
const sceneElement = z.object({}).catchall(z.unknown());

export const canvasRouter = router({
  getScene: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      const [found] = await ctx.db.select().from(room).where(eq(room.id, input.roomId));
      if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
      return { scene: found.canvasScene };
    }),

  pushScene: protectedProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        elements: z.array(sceneElement).max(5000),
        files: z.record(z.string().min(1).max(128), sceneFile).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      const payload = JSON.stringify({ elements: input.elements, files: input.files });
      if (payload.length > 8000000) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Scene too large" });
      }
      await ctx.db.update(room).set({ canvasScene: payload }).where(eq(room.id, input.roomId));
      const message: CanvasSceneMessage = {
        from: ctx.session.user.id,
        elements: input.elements as unknown[],
        files: input.files as Record<string, unknown>,
      };
      canvasBus.emit(canvasChannel(input.roomId), { type: "scene", message });
      return { ok: true };
    }),

  onScene: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .subscription(async function* (opts) {
      const { ctx, input, signal } = opts;
      await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      const userId = ctx.session.user.id;
      for await (const [event] of on(canvasBus, canvasChannel(input.roomId), { signal })) {
        const data = event as { type: string; message: CanvasSceneMessage | CanvasPointerMessage };
        if (data.type !== "scene") continue;
        const scene = data.message as CanvasSceneMessage;
        if (scene.from === userId) continue;
        yield tracked(`${Date.now()}:${scene.from}`, scene);
      }
    }),

  pushPointer: protectedProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        x: z.number().finite(),
        y: z.number().finite(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      const identity = await getIdentity(ctx.db, ctx.session.user.id);
      const message: CanvasPointerMessage = {
        from: ctx.session.user.id,
        userName: identity.name,
        userColor: identity.color,
        x: input.x,
        y: input.y,
      };
      canvasBus.emit(canvasChannel(input.roomId), { type: "pointer", message });
      return { ok: true };
    }),

  onPointer: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .subscription(async function* (opts) {
      const { ctx, input, signal } = opts;
      await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      const userId = ctx.session.user.id;
      for await (const [event] of on(canvasBus, canvasChannel(input.roomId), { signal })) {
        const data = event as { type: string; message: CanvasSceneMessage | CanvasPointerMessage };
        if (data.type !== "pointer") continue;
        const pointer = data.message as CanvasPointerMessage;
        if (pointer.from === userId) continue;
        yield tracked(`${Date.now()}:${pointer.from}`, pointer);
      }
    }),

  heartbeat: protectedProcedure
    .input(z.object({ roomId: z.string().min(1), inPrivate: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      const identity = await getIdentity(ctx.db, ctx.session.user.id);
      touchPresence(input.roomId, {
        userId: ctx.session.user.id,
        userName: identity.name,
        userColor: identity.color,
        inPrivate: input.inPrivate,
      });
      canvasBus.emit(canvasChannel(input.roomId), { type: "presence", message: null });
      return { online: listPresence(input.roomId) };
    }),

  leave: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      leavePresence(input.roomId, ctx.session.user.id);
      canvasBus.emit(canvasChannel(input.roomId), { type: "presence", message: null });
      return { ok: true };
    }),

  onPresence: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .subscription(async function* (opts) {
      const { ctx, input, signal } = opts;
      await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      yield tracked(`init:${Date.now()}`, listPresence(input.roomId));
      for await (const [event] of on(canvasBus, canvasChannel(input.roomId), { signal })) {
        const data = event as { type: string };
        if (data.type !== "presence") continue;
        yield tracked(`presence:${Date.now()}`, listPresence(input.roomId));
      }
    }),
});
