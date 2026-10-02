import { room, roomMember } from "@chimera2/db/schema/rooms";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { logRoomEvent } from "../realtime/log";

function slugify(name: string) {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${slug || "room"}-${suffix}`;
}

function newInviteToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

export const roomsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const memberships = await ctx.db
      .select({
        roomId: roomMember.roomId,
        role: roomMember.role,
        roomName: room.name,
      })
      .from(roomMember)
      .innerJoin(room, eq(roomMember.roomId, room.id))
      .where(eq(roomMember.userId, userId));
    return memberships.map((m) => ({
      id: m.roomId,
      name: m.roomName,
      role: m.role,
    }));
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const id = slugify(input.name);
      const inviteToken = newInviteToken();
      await ctx.db.insert(room).values({
        id,
        name: input.name.trim(),
        ownerId: userId,
        inviteToken,
      });
      await ctx.db.insert(roomMember).values({
        roomId: id,
        userId,
        role: "master",
      });
      await logRoomEvent(ctx.db, {
        roomId: id,
        actorId: userId,
        type: "room_created",
        payload: { kind: "room_created", name: input.name.trim(), author: ctx.session.user.name },
      });
      return { id, name: input.name.trim(), inviteToken };
    }),

  get: protectedProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const [found] = await ctx.db.select().from(room).where(eq(room.id, input.id));
    if (!found) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
    }
    const [membership] = await ctx.db
      .select()
      .from(roomMember)
      .where(and(eq(roomMember.roomId, input.id), eq(roomMember.userId, userId)));
    if (!membership) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this room" });
    }
    return {
      id: found.id,
      name: found.name,
      role: membership.role,
      inviteToken: membership.role === "master" ? found.inviteToken : null,
    };
  }),

  joinByToken: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [found] = await ctx.db.select().from(room).where(eq(room.inviteToken, input.token));
      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite" });
      }
      await ctx.db.insert(roomMember).values({ roomId: found.id, userId, role: "player" }).onConflictDoNothing();
      await logRoomEvent(ctx.db, {
        roomId: found.id,
        actorId: userId,
        type: "member_joined",
        payload: { kind: "member_joined", name: ctx.session.user.name },
      });
      return { id: found.id, name: found.name };
    }),
});
