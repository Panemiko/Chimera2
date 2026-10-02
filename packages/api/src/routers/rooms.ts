import { on } from "events";
import { tracked } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import { publishRoomMessage, roomBus, type RoomMessage } from "../realtime/bus";

const roomIdInput = z.string().min(1).max(128);

export const roomRouter = router({
  sendMessage: publicProcedure
    .input(
      z.object({
        roomId: roomIdInput,
        text: z.string().min(1).max(1000),
      }),
    )
    .mutation(({ ctx, input }) => {
      const message: RoomMessage = {
        id: crypto.randomUUID(),
        roomId: input.roomId,
        text: input.text,
        author: ctx.session?.user.name ?? "anon",
        sentAt: new Date().toISOString(),
      };
      publishRoomMessage(message);
      return message;
    }),

  onMessage: publicProcedure
    .input(
      z.object({
        roomId: roomIdInput,
        lastEventId: z.string().nullish(),
      }),
    )
    .subscription(async function* (opts) {
      for await (const [message] of on(roomBus, `message:${opts.input.roomId}`, {
        signal: opts.signal,
      })) {
        yield tracked((message as RoomMessage).id, message as RoomMessage);
      }
    }),
});
