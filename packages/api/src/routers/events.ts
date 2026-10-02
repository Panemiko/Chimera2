import type { Database } from "@chimera2/db";
import { roomEvent } from "@chimera2/db/schema/room-events";
import { roomMember } from "@chimera2/db/schema/rooms";
import { TRPCError } from "@trpc/server";
import { tracked } from "@trpc/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { on } from "events";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { canSeeEvent, roomBus, roomChannel, type RoomEventData } from "../realtime/bus";
import { toRoomEventData } from "../realtime/log";

type Ctx = {
  db: Database;
  session: { user: { id: string } };
};

async function getMembership(ctx: Ctx, roomId: string) {
  const [membership] = await ctx.db
    .select()
    .from(roomMember)
    .where(and(eq(roomMember.roomId, roomId), eq(roomMember.userId, ctx.session.user.id)));
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this room" });
  }
  return membership;
}

export const eventsRouter = router({
  list: protectedProcedure
    .input(z.object({ roomId: z.string().min(1), limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const membership = await getMembership(ctx, input.roomId);
      const rows = await ctx.db
        .select()
        .from(roomEvent)
        .where(eq(roomEvent.roomId, input.roomId))
        .orderBy(desc(roomEvent.id))
        .limit(input.limit);
      return rows
        .map(toRoomEventData)
        .filter((e) => canSeeEvent(membership.role, ctx.session.user.id, e))
        .reverse();
    }),

  onEvent: protectedProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        lastEventId: z.string().nullish(),
      }),
    )
    .subscription(async function* (opts) {
      const { ctx, input, signal } = opts;
      const membership = await getMembership(ctx, input.roomId);
      const userId = ctx.session.user.id;

      if (input.lastEventId) {
        const since = Number.parseInt(input.lastEventId, 10);
        if (Number.isFinite(since)) {
          const rows = await ctx.db
            .select()
            .from(roomEvent)
            .where(and(eq(roomEvent.roomId, input.roomId), gt(roomEvent.id, since)));
          for (const row of rows) {
            const event = toRoomEventData(row);
            if (canSeeEvent(membership.role, userId, event)) {
              yield tracked(String(event.id), event);
            }
          }
        }
      }

      for await (const [event] of on(roomBus, roomChannel(input.roomId), { signal })) {
        const data = event as RoomEventData;
        if (canSeeEvent(membership.role, userId, data)) {
          yield tracked(String(data.id), data);
        }
      }
    }),
});
