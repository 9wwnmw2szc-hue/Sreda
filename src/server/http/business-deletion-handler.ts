import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Identity } from "../identity/auth.ts";
import { BusinessDeletionService } from "../business/deletion.ts";
import { AppError, json, readJson, requireOrigin, respond } from "./errors.ts";
import { limit } from "./limits.ts";

export function createBusinessDeletionHandler(options: {
  db: Kysely<Database>;
  auth: Identity;
  origin: string;
  secret: string;
}) {
  const service = new BusinessDeletionService(options.db);
  return (request: Request, businessId: string) =>
    respond(request, async () => {
      const session = await options.auth.api.getSession({
        headers: request.headers,
      });
      if (!session?.user.username)
        throw new AppError(401, "UNAUTHENTICATED", "Войдите в аккаунт.");

      if (request.method === "GET") {
        await limit(
          options.db,
          options.secret,
          "business-deletion:impact:" + session.user.id,
          30,
          60,
        );
        return json(await service.impact(session.user.id, businessId));
      }

      if (request.method !== "POST")
        throw new AppError(405, "METHOD_NOT_ALLOWED", "Метод недоступен.");
      requireOrigin(request, options.origin);
      await limit(
        options.db,
        options.secret,
        "business-deletion:" + session.user.id,
        10,
        600,
      );
      const body = await readJson(request);
      const action = body.action;
      if (action === "request")
        return json(await service.request(session.user.id, businessId));
      if (action === "confirm")
        return json(
          await service.confirm(session.user.id, businessId, body),
        );
      throw new AppError(400, "INVALID_ACTION", "Действие недоступно.");
    });
}
