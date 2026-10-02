import type { Context as ApiContext } from "@chimera2/api/context";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { fromNodeHeaders } from "better-auth/node";

import { db } from "./services";
import { auth } from "./services";

export async function createContext({ req }: CreateFastifyContextOptions): Promise<ApiContext> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  return {
    db,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
