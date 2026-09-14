import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Identity } from "../identity/auth.ts";
import { changePassword } from "../identity/password.ts";
import { AppError, json, readJson, requireOrigin, respond } from "./errors.ts";
import { limit } from "./limits.ts";

export function createPasswordHandler(options: { db: Kysely<Database>; auth: Identity; origin: string; secret: string }) {
  return (request: Request) => respond(async () => {
    if (request.method !== "POST") throw new AppError(405, "METHOD_NOT_ALLOWED", "Метод недоступен.");
    requireOrigin(request, options.origin);
    const session = await options.auth.api.getSession({ headers: request.headers });
    if (!session?.user.username) throw new AppError(401, "UNAUTHENTICATED", "Войдите в аккаунт.");
    await limit(options.db, options.secret, "password:change:" + session.user.id, 5, 600);
    return json(await changePassword(options.db, session.user.id, session.session.id, await readJson(request)));
  });
}
