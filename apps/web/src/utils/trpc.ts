import type { AppRouter } from "@chimera2/api/routers/index";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, createWSClient, httpBatchLink, splitLink, wsLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

import { ENV } from "../env";

function getServerUrl(url: string) {
  const processEnv = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
  if (typeof window === "undefined" && processEnv?.SERVER_URL) {
    return processEnv.SERVER_URL.endsWith("/")
      ? processEnv.SERVER_URL.slice(0, -1)
      : processEnv.SERVER_URL;
  }

  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function toWsUrl(httpUrl: string) {
  return httpUrl.replace(/^http/, "ws");
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      toast.error(error.message, {
        action: {
          label: "retry",
          onClick: () => {
            query.invalidate();
          },
        },
      });
    },
  }),
});

const httpLink = httpBatchLink({
  url: `${getServerUrl(ENV.VITE_SERVER_URL)}/trpc`,
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
});

// WebSocket only exists in the browser. The server bundle (SSR) keeps
// HTTP-only links so module evaluation never touches `WebSocket`.
const wsClient =
  typeof window === "undefined"
    ? undefined
    : createWSClient({
        url: `${toWsUrl(getServerUrl(ENV.VITE_SERVER_URL))}/trpc`,
        retryDelayMs: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      });

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    wsClient
      ? splitLink({
          condition: (op) => op.type === "subscription",
          true: wsLink({ client: wsClient }),
          false: httpLink,
        })
      : httpLink,
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
