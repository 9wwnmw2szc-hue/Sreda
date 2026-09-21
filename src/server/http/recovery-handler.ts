import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Identity } from "../identity/auth.ts";
import { RecoveryService } from "../identity/recovery.ts";
import { AppError, json, readJson, requireOrigin, respond } from "./errors.ts";
import { limit } from "./limits.ts";

export function createRecoveryHandler(options: { db: Kysely<Database>; auth: Identity; origin: string; secret: string }) {
  const service = new RecoveryService(options.db);
  return (request: Request, operation: "codes" | "recover") => respond(request, async () => {
    if (request.method !== "GET" && request.method !== "POST") throw new AppError(405, "METHOD_NOT_ALLOWED", "Метод недоступен.");
    if (request.method === "POST") requireOrigin(request, options.origin);
    if (operation === "recover") {
      if (request.method !== "POST") throw new AppError(405, "METHOD_NOT_ALLOWED", "Метод недоступен.");
      const body = await readJson(request);
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase().slice(0, 30) : "";
      await limit(options.db, options.secret, "recovery:global", 100, 60);
      await limit(options.db, options.secret, "recovery:user:" + username, 5, 600);
      return json(await service.recover(body));
    }
    const session = await options.auth.api.getSession({ headers: request.headers });
    if (!session?.user.username) throw new AppError(401, "UNAUTHENTICATED", "Войдите в аккаунт.");
    if (request.method === "GET") return json(await service.status(session.user.id));
    await limit(options.db, options.secret, "recovery:issue:" + session.user.id, 5, 600);
    return json(await service.issue(session.user.id, (await readJson(request)).currentPassword));
  });
}
