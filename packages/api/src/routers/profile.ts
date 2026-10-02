import { user } from "@chimera2/db/schema/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

export const profileRouter = router({
  setColor: protectedProcedure
    .input(z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(user).set({ color: input.color }).where(eq(user.id, ctx.session.user.id));
      return { color: input.color };
    }),
});
