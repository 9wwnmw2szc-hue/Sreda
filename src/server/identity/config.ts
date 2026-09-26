import { AppError } from "../http/errors.ts";

function resolveOrigin(value: string, message: string) {
  const parsed = new URL(value);
  if (parsed.origin !== value || (parsed.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "terminal.local"].includes(parsed.hostname)))) {
    throw new Error(message);
  }
  return parsed.origin;
}

export function runtimeConfig() {
  const url = process.env.APP_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const databaseUrl = process.env.DATABASE_URL;
  if (!url || !secret || secret.length < 32 || !databaseUrl) {
    throw new AppError(503, "SETUP_REQUIRED", "Вход скоро будет доступен. Попробуйте позже.");
  }
  const origin = resolveOrigin(url, "Invalid application origin");
  const webhookBase = process.env.TELEGRAM_WEBHOOK_BASE_URL?.trim();
  const telegramWebhookOrigin = webhookBase
    ? resolveOrigin(webhookBase, "Invalid Telegram webhook base URL")
    : origin;
  return { origin, telegramWebhookOrigin, secret, databaseUrl };
}
