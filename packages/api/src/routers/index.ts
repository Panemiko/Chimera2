import { publicProcedure, router } from "../index";
import { canvasRouter } from "./canvas";
import { charactersRouter } from "./characters";
import { diceRouter } from "./dice";
import { eventsRouter } from "./events";
import { profileRouter } from "./profile";
import { roomsRouter } from "./rooms";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  rooms: roomsRouter,
  profile: profileRouter,
  dice: diceRouter,
  canvas: canvasRouter,
  characters: charactersRouter,
  events: eventsRouter,
});
export type AppRouter = typeof appRouter;
