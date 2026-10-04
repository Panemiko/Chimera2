import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@chimera2/db";
import * as schema from "@chimera2/db/schema/auth";
import { betterAuth } from "better-auth";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = [],
) {
  // Cookies `Secure` sao recusados pelo navegador em origem http sem TLS
  // (ex.: IP do ZeroTier), entao a sessao nunca grudava: o sign-up
  // retornava sucesso mas os requests seguintes iam sem cookie.
  // localhost e excecao (contexto seguro), por isso o dev funcionava.
  const isSecure = env.BETTER_AUTH_URL.startsWith("https://");
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN, ...desktopOrigins],
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        color: { type: "string", required: false },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: isSecure ? "none" : "lax",
        secure: isSecure,
        httpOnly: true,
      },
    },
    plugins: [],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
