import type { Context as ApiContext } from "@chimera2/api/context";
import { fromNodeHeaders } from "better-auth/node";

import { db } from "./services";
import { auth } from "./services";

type HeadersLike = {
  headers: Record<string, string | string[] | undefined>;
};

// Fastify passes a FastifyRequest, the WS adapter passes a Node
// IncomingMessage. Both carry `.headers`, which is all we need to
// resolve the Better-Auth session, so one function serves both.
export async function createContext({ req }: { req: HeadersLike }): Promise<ApiContext> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  return {
    db,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
