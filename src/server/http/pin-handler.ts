import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Identity } from "../identity/auth.ts";
import { PinService } from "../identity/pin.ts";
import { AppError, json, readJson, requireOrigin, respond } from "./errors.ts";
import { limit } from "./limits.ts";

export function createPinHandler(options: { db: Kysely<Database>; auth: Identity; origin: string; secret: string }) {
  const service = new PinService(options.db, options.secret);
  return (request: Request) => respond(async () => {
    if (!["GET", "POST"].includes(request.method)) throw new AppError(405, "METHOD_NOT_ALLOWED", "Метод недоступен.");
    if (request.method === "POST") requireOrigin(request, options.origin);
    const session = await options.auth.api.getSession({ headers: request.headers });
    if (!session?.user.username) throw new AppError(401, "UNAUTHENTICATED", "Войдите в аккаунт.");
    if (request.method === "GET") return json(await service.status(session.user.id));
    await limit(options.db, options.secret, "pin:manage:" + session.user.id, 5, 900);
    return json(await service.configure(session.user.id, session.session.id, await readJson(request)));
  });
}
