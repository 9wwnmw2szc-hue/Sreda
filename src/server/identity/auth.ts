import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins/username";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";

export function createIdentity(options: {
  db: Kysely<Database>;
  origin: string;
  secret: string;
}) {
  return betterAuth({
    appName: "Среда",
    baseURL: options.origin,
    basePath: "/api/auth",
    secret: options.secret,
    trustedOrigins: [options.origin],
    database: { db: options.db, type: "postgres", transaction: true },
    emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128, requireEmailVerification: false },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: options.origin.startsWith("https:"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      // The edge must supply a trusted client IP before IP tracking is enabled.
      ipAddress: { ipAddressHeaders: [] },
    },
    // Additional global and per-login atomic limits live in our HTTP boundary.
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100,
      customRules: { "/sign-up/email": { window: 60, max: 100 }, "/sign-in/username": { window: 60, max: 100 } } },
    logger: { disabled: true },
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 30 })],
  });
}
export type Identity = ReturnType<typeof createIdentity>;
