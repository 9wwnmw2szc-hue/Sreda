import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Identity } from "../identity/auth.ts";
import { AppError, json, readJson, requireOrigin, respond } from "./errors.ts";
import { limit } from "./limits.ts";
import { acceptLogin, loginCredential } from "../identity/login-guard.ts";

export function createAuthHandler(options: { db: Kysely<Database>; auth: Identity; origin: string; secret: string }) {
  return (request: Request) => respond(request, async () => {
    requireOrigin(request, options.origin);
    const path = new URL(request.url).pathname.replace("/api/auth", "");
    if (request.method !== "POST" || !["/sign-up/username", "/sign-in/username", "/sign-out"].includes(path)) {
      throw new AppError(404, "NOT_FOUND", "Страница не найдена.");
    }
    const body = await readJson(request);
    const signup = path === "/sign-up/username";
    let safeBody: Record<string, unknown> = {};
    if (path !== "/sign-out") {
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      if (!/^[a-z0-9_.]{3,30}$/.test(username)) throw new AppError(400, "INVALID_USERNAME", "Логин: 3–30 символов, латинские буквы, цифры, точка или подчёркивание.");
      if (typeof body.password !== "string" || body.password.length < 10 || body.password.length > 128) {
        throw new AppError(400, "INVALID_PASSWORD", "Пароль должен содержать от 10 до 128 символов.");
      }
      if (signup && body.password !== body.passwordConfirmation) throw new AppError(400, "PASSWORD_MISMATCH", "Пароли не совпадают.");
      await limit(options.db, options.secret, "auth:global", 300, 60);
      await limit(options.db, options.secret, `auth:${signup ? "signup" : "login"}:${username}`, 10, 600);
      safeBody = { username, password: body.password };
      // Better Auth requires an email field internally. Reserved .invalid domain:
      // never a contact address, never exposed, never used for mail or recovery.
      if (signup) safeBody = { ...safeBody, name: username, email: `${username}@accounts.sreda.invalid` };
    }
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const signingIn = path === "/sign-in/username";
    const credential = signingIn ? await loginCredential(options.db, safeBody.username as string) : undefined;
    const result = await options.auth.handler(new Request(options.origin + "/api/auth" + (signup ? "/sign-up/email" : path), {
      method: "POST", headers, body: JSON.stringify(safeBody),
    }));
    if (!result.ok) {
      const payload = await result.json().catch(() => ({}));
      const rateLimited = result.status === 429;
      const duplicate = signup && ["USERNAME_IS_ALREADY_TAKEN", "USER_ALREADY_EXISTS", "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"].includes(payload.code);
      throw new AppError(rateLimited ? 429 : duplicate ? 409 : result.status >= 500 ? 503 : 400,
        rateLimited ? "RATE_LIMITED" : duplicate ? "USERNAME_TAKEN" : "AUTH_FAILED",
        rateLimited ? "Слишком много попыток. Попробуйте через 10 минут."
          : duplicate ? "Этот логин уже занят. Выберите другой."
          : result.status >= 500 ? "Не удалось войти. Попробуйте позже."
          : signup ? "Не удалось создать аккаунт. Проверьте логин и пароль." : "Неверный логин или пароль.");
    }
    if (signingIn) {
      const payload = await result.json();
      if (typeof payload.token !== "string" || !payload.token) throw new Error("Missing internal session token");
      const accepted = await acceptLogin(options.db, credential, payload.token, options.secret, body.pin);
      if (accepted === "locked") throw new AppError(429, "PIN_LOCKED", "Слишком много неверных PIN. Повторите вход через 15 минут или восстановите доступ резервным кодом.");
      if (accepted === "pin") throw new AppError(400, "PIN_REQUIRED", body.pin ? "PIN не подходит. Проверьте четыре цифры." : "Введите PIN вашего аккаунта.");
      if (accepted !== "accepted") {
        throw new AppError(400, "AUTH_FAILED", "Неверный логин или пароль.");
      }
    }
    const response = json({ ok: true });
    for (const cookie of result.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
    if (path === "/sign-out") {
      response.headers.set("Clear-Site-Data", '"cache"');
      response.headers.set("Cache-Control", "no-store");
    }
    return response;
  });
}
