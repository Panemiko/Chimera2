import { protectedProcedure, publicProcedure, router } from "../index";
import { roomRouter } from "./rooms";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  room: roomRouter,
});
export type AppRouter = typeof appRouter;
