import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Identity } from "../identity/auth.ts";
import { SolutionService } from "../solutions/service.ts";
import { TelegramService } from "../telegram/service.ts";
import { AppError, json, readJson, requireOrigin, respond } from "./errors.ts";
import { limit } from "./limits.ts";
export function createSolutionHandler(options: {
  db: Kysely<Database>;
  auth: Identity;
  origin: string;
  secret: string;
  telegramEnabled?: boolean;
  vkEnabled?: boolean;
  telegram?: TelegramService;
}) {
  const solutions = new SolutionService(
    options.db,
    options.telegramEnabled,
    options.vkEnabled,
  );
  return (
    request: Request,
    id: string,
    action: "setup" | "solutions" | "start",
  ) =>
    respond(request, async () => {
      if (
        !["GET", "POST"].includes(request.method) ||
        (action === "start" && request.method !== "POST")
      )
        throw new AppError(405, "METHOD_NOT_ALLOWED", "Метод недоступен.");
      if (request.method !== "GET") requireOrigin(request, options.origin);
      const session = await options.auth.api.getSession({
        headers: request.headers,
      });
      if (!session?.user.username)
        throw new AppError(401, "UNAUTHENTICATED", "Войдите в аккаунт.");
      if (action === "solutions") {
        if (request.method === "GET")
          return json(await solutions.list(session.user.id, id));
        await limit(
          options.db,
          options.secret,
          "solution:" + session.user.id,
          30,
          60,
        );
        return json(
          await solutions.activate(
            session.user.id,
            id,
            await readJson(request),
          ),
        );
      }
      if (action === "setup" && request.method === "GET")
        return json(await solutions.get(session.user.id, id));
      await limit(
        options.db,
        options.secret,
        "solution:" + session.user.id,
        30,
        60,
      );
      if (action === "setup")
        return json(
          await solutions.save(session.user.id, id, await readJson(request)),
        );
      return json(
        await (
          options.telegram ??
          new TelegramService(
            options.db,
            options.secret,
            options.origin,
            !!options.telegramEnabled,
          )
        ).start(session.user.id, id),
      );
    });
}
