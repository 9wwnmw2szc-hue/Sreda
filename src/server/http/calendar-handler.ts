import { getRuntime } from "../runtime";
import { createApplication } from "./application";
import { AppError, json, readJson, requireOrigin, respond } from "./errors";
import { limit } from "./limits";
import { CalendarService } from "../calendar/service";

export function calendarHandler(
  request: Request,
  publicId: string,
  resource: "calendar" | "reminders",
  eventId?: string,
) {
  return respond(request, async () => {
    const runtime = getRuntime();
    const user = await createApplication(runtime).requireUser(request.headers);
    const service = new CalendarService(runtime.db);
    const p = new URL(request.url).searchParams;
    if (request.method !== "GET") {
      requireOrigin(request, runtime.origin);
      await limit(
        runtime.db,
        runtime.secret,
        "calendar:" + publicId + ":" + user.id,
        60,
        60,
      );
    }
    if (resource === "reminders") {
      if (request.method !== "POST")
        throw new AppError(405, "METHOD_NOT_ALLOWED", "Действие недоступно.");
      return json(
        await service.scheduleEntityReminders(
          user.id,
          publicId,
          await readJson(request),
        ),
        201,
      );
    }
    if (request.method === "GET" && eventId)
      return json(await service.get(user.id, publicId, eventId));
    if (request.method === "GET") {
      const specialists = p.getAll("specialist").filter(Boolean);
      const types = p.getAll("type").filter(Boolean);
      return json(
        await service.listRange(
          user.id,
          publicId,
          p.get("from") ?? "",
          p.get("to") ?? "",
          {
            specialistIds: specialists.length ? specialists : undefined,
            types: types.length ? types : undefined,
            onlyMine: p.get("onlyMine") === "1" || p.get("onlyMine") === "true",
            includeBookings:
              p.get("includeBookings") === "1" ||
              p.get("includeBookings") === "true",
          },
        ),
      );
    }
    if (request.method === "POST")
      return json(
        await service.create(user.id, publicId, await readJson(request)),
        201,
      );
    if (request.method === "PATCH" && eventId)
      return json(
        await service.update(
          user.id,
          publicId,
          eventId,
          await readJson(request),
        ),
      );
    if (request.method === "DELETE" && eventId)
      return json(await service.cancel(user.id, publicId, eventId));
    throw new AppError(405, "METHOD_NOT_ALLOWED", "Действие недоступно.");
  });
}
