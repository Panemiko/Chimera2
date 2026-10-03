import { appRouter, type AppRouter } from "@chimera2/api/routers/index";
import fastifyCors from "@fastify/cors";
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from "@trpc/server/adapters/fastify";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { initLogger } from "evlog";
import { createAuthMiddleware, type BetterAuthInstance } from "evlog/better-auth";
import { evlog, useLogger } from "evlog/fastify";
import { createFsDrain } from "evlog/fs";
import Fastify from "fastify";
import { WebSocketServer } from "ws";

import { createContext } from "./context";
import { ENV } from "./env.server";
import { auth } from "./services";
import { registerUploads } from "./uploads";

const baseCorsConfig = {
  origin: ENV.CORS_ORIGIN,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86400,
};

initLogger({
  env: { service: "chimera2-server" },
});

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

const fastify = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024,
});

fastify.register(evlog, {
  drain: process.env.NODE_ENV === "production" ? undefined : createFsDrain(),
});
fastify.addHook("preHandler", async (request) => {
  await identifyUser(useLogger(), request.headers, request.url);
});
fastify.register(fastifyCors, baseCorsConfig);

fastify.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = new Headers();
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) headers.append(key, value.toString());
      });
      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      const response = await auth.handler(req);
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(response.body ? await response.text() : null);
    } catch (error) {
      fastify.log.error({ err: error }, "Authentication Error:");
      reply.status(500).send({
        error: "Internal authentication error",
        code: "AUTH_FAILURE",
      });
    }
  },
});

fastify.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error }) {
      console.error(`Error in tRPC handler on path '${path}':`, error);
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
});

fastify.get("/", async () => {
  return "OK";
});

await registerUploads(fastify);

await fastify.listen({ port: 3000, host: "0.0.0.0" });
console.log("Server running on port 3000");

// WebSocket transport for tRPC subscriptions, sharing the same HTTP
// server (and port) as the Fastify app. Queries and mutations keep
// using HTTP; only subscriptions go through here.
const wss = new WebSocketServer({ server: fastify.server });
const wssHandler = applyWSSHandler({
  wss,
  router: appRouter,
  createContext,
  keepAlive: {
    enabled: true,
    pingMs: 30000,
    pongWaitMs: 5000,
  },
});

wss.on("connection", (ws) => {
  console.log(`++ Connection (${wss.clients.size})`);
  ws.once("close", () => {
    console.log(`-- Connection (${wss.clients.size})`);
  });
});

process.on("SIGTERM", () => {
  console.log("SIGTERM");
  wssHandler.broadcastReconnectNotification();
  wss.close();
});
