import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";

export function createIdentity(options: {
  db: Kysely<Database>;
  origin: string;
  secret: string;
  sendCode: (email: string, code: string) => Promise<void>;
}) {
  return betterAuth({
    appName: "Среда",
    baseURL: options.origin,
    basePath: "/api/auth",
    secret: options.secret,
    trustedOrigins: [options.origin],
    database: { db: options.db, type: "postgres", transaction: true },
    emailAndPassword: { enabled: false },
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
    // Additional global and per-email atomic limits live in our HTTP boundary.
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    logger: { disabled: true },
    plugins: [emailOTP({
      otpLength: 6, expiresIn: 300, allowedAttempts: 5, storeOTP: "hashed",
      rateLimit: { window: 60, max: 100 },
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") throw new Error("Unsupported email flow");
        await options.sendCode(email, otp);
      },
    })],
  });
}
export type Identity = ReturnType<typeof createIdentity>;
