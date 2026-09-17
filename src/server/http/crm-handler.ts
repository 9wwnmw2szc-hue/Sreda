import { getRuntime } from "../runtime";
import { createApplication } from "./application";
import { json, readJson, requireOrigin, respond, AppError } from "./errors";
import { limit } from "./limits";
import { ClientService } from "../clients/service";
import { NotificationService } from "../notifications/service";
import { BusinessProfileService } from "../workspaces/profile";
export function crmHandler(
  request: Request,
  businessId: string,
  resource: "clients" | "notifications" | "profile",
  id?: string,
) {
  return respond(async () => {
    const runtime = getRuntime();
    const user = await createApplication(runtime).requireUser(request.headers);
    if (request.method !== "GET") {
      requireOrigin(request, runtime.origin);
      await limit(
        runtime.db,
        runtime.secret,
        "crm:" + businessId + ":" + user.id,
        60,
        60,
      );
    }
    if (resource === "profile") {
      const service = new BusinessProfileService(runtime.db);
      return json(
        request.method === "GET"
          ? await service.get(user.id, businessId)
          : await service.save(
              user.id,
              businessId,
              await readJson(request, 48000),
            ),
      );
    }
    if (resource === "notifications") {
      const service = new NotificationService(runtime.db);
      if (request.method === "GET")
        return json(await service.list(user.id, businessId));
      const body = await readJson(request);
      if (
        body.action === "mark_all_read" ||
        body.mark_all === true ||
        body.all === true
      )
        return json(await service.markAllRead(user.id, businessId));
      return json(
        await service.read(user.id, businessId, String(body.id)),
      );
    }
    const service = new ClientService(runtime.db);
    if (request.method === "GET") {
      const p = new URL(request.url).searchParams;
      return json(
        id
          ? await service.detail(
              user.id,
              businessId,
              id,
              Number(p.get("page") ?? 0),
            )
          : await service.list(
              user.id,
              businessId,
              p.get("search") ?? "",
              p.get("after") ?? undefined,
              p.get("filter") ?? "all",
            ),
      );
    }
    const body = await readJson(request, 16000);
    if (id && request.method === "POST")
      return json(await service.note(user.id, businessId, id, body.text), 201);
    if (request.method === "POST" || request.method === "PATCH")
      return json(
        await service.save(user.id, businessId, body, id),
        id ? 200 : 201,
      );
    throw new AppError(405, "METHOD_NOT_ALLOWED", "Действие недоступно.");
  });
}
