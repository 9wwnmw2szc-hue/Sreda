import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Identity } from "../identity/auth.ts";
import { AccountDeletionService } from "../account/deletion.ts";
import { AppError, json, readJson, requireOrigin, respond } from "./errors.ts";
import { limit } from "./limits.ts";

export function createAccountDeletionHandler(options: {
  db: Kysely<Database>;
  auth: Identity;
  origin: string;
  secret: string;
}) {
  const service = new AccountDeletionService(options.db);
  return (request: Request) =>
    respond(async () => {
      const session = await options.auth.api.getSession({
        headers: request.headers,
      });
      if (!session?.user.username)
        throw new AppError(401, "UNAUTHENTICATED", "Войдите в аккаунт.");

      const userRow = await options.db
        .selectFrom("user")
        .select(["id", "deletion_status", "deleted_at"])
        .where("id", "=", session.user.id)
        .executeTakeFirst();
      if (!userRow)
        throw new AppError(401, "UNAUTHENTICATED", "Войдите в аккаунт.");
      if (
        userRow.deletion_status === "deleted" ||
        userRow.deleted_at != null
      ) {
        if (request.method === "GET")
          return json(await service.impact(session.user.id));
        throw new AppError(409, "ALREADY_DELETED", "Аккаунт уже удалён.");
      }

      if (request.method === "GET") {
        await limit(
          options.db,
          options.secret,
          "account-deletion:impact:" + session.user.id,
          30,
          60,
        );
        return json(await service.impact(session.user.id));
      }

      if (request.method !== "POST")
        throw new AppError(405, "METHOD_NOT_ALLOWED", "Метод недоступен.");
      requireOrigin(request, options.origin);
      await limit(
        options.db,
        options.secret,
        "account-deletion:" + session.user.id,
        10,
        600,
      );
      const body = await readJson(request);
      const action = body.action;
      if (action === "request")
        return json(await service.request(session.user.id));
      if (action === "cancel")
        return json(await service.cancelPending(session.user.id));
      if (action === "confirm")
        return json(await service.confirm(session.user.id, body));
      throw new AppError(400, "INVALID_ACTION", "Действие недоступно.");
    });
}
