import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Identity } from "../identity/auth.ts";
import { AppError, json, readJson, requireOrigin, respond } from "./errors.ts";
import { limit } from "./limits.ts";

export function createAuthHandler(options: { db: Kysely<Database>; auth: Identity; origin: string; secret: string }) {
  return (request: Request) => respond(async () => {
    requireOrigin(request, options.origin);
    const path = new URL(request.url).pathname.replace("/api/auth", "");
    if (request.method !== "POST" || ![
      "/email-otp/send-verification-otp", "/sign-in/email-otp", "/sign-out",
    ].includes(path)) throw new AppError(404, "NOT_FOUND", "Страница не найдена.");
    const body = await readJson(request);
    const isSend = path === "/email-otp/send-verification-otp";
    if (path !== "/sign-out") {
      if (typeof body.email !== "string" || body.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
        throw new AppError(400, "INVALID_EMAIL", "Проверьте адрес электронной почты.");
      }
      body.email = body.email.trim().toLowerCase();
      if (!isSend && (typeof body.otp !== "string" || !/^\d{6}$/.test(body.otp))) {
        throw new AppError(400, "INVALID_OTP", "Введите код из шести цифр.");
      }
      await limit(options.db, options.secret, "auth:global", 300, 60);
      await limit(options.db, options.secret, `auth:${isSend ? "send" : "verify"}:${body.email}`, isSend ? 1 : 10, isSend ? 60 : 600);
      if (isSend) await limit(options.db, options.secret, `auth:hour:${body.email}`, 5, 3600);
    }
    const safeBody = path === "/sign-out" ? {} : isSend
      ? { email: body.email, type: "sign-in" }
      : { email: body.email, otp: body.otp,
        name: typeof body.name === "string" ? body.name.trim().slice(0, 80) : "" };
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const result = await options.auth.handler(new Request(options.origin + "/api/auth" + path, {
      method: "POST", headers, body: JSON.stringify(safeBody),
    }));
    if (!result.ok) {
      const payload = await result.json().catch(() => ({}));
      const rateLimited = result.status === 429 || payload.code === "TOO_MANY_ATTEMPTS";
      const unavailable = result.status >= 500;
      throw new AppError(rateLimited ? 429 : unavailable ? 503 : 400,
        rateLimited ? "RATE_LIMITED" : unavailable ? "MAIL_UNAVAILABLE" : "INVALID_OTP",
        rateLimited ? "Слишком много попыток. Подождите и запросите новый код."
          : unavailable ? "Не удалось отправить письмо. Попробуйте позже."
          : "Код неверный или истёк. Проверьте письмо или запросите новый.");
    }
    // Forward signed HttpOnly cookies, never the session token in a JSON response.
    const response = json({ ok: true }, isSend ? 202 : 200);
    for (const cookie of result.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
    if (path === "/sign-out") response.headers.set("Clear-Site-Data", '"cache"');
    return response;
  });
}
