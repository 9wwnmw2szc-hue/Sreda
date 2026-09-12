import { AppError } from "../http/errors.ts";

export function runtimeConfig() {
  const url = process.env.APP_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const databaseUrl = process.env.DATABASE_URL;
  if (!url || !secret || secret.length < 32 || !databaseUrl) {
    throw new AppError(503, "SETUP_REQUIRED", "Вход скоро будет доступен. Попробуйте позже.");
  }
  const parsed = new URL(url);
  if (parsed.origin !== url || (parsed.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "terminal.local"].includes(parsed.hostname)))) {
    throw new Error("Invalid application origin");
  }
  return { origin: parsed.origin, secret, databaseUrl };
}
