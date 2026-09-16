import { getRuntime } from "../runtime";
import { createApplication } from "./application";
import { AppError, json, readJson, requireOrigin, respond } from "./errors";
import { limit } from "./limits";
import { BookingService } from "../booking/service";
export function bookingHandler(
  request: Request,
  publicId: string,
  resource: "bookings" | "booking-config" | "booking-slots",
  bookingId?: string,
) {
  return respond(async () => {
    const runtime = getRuntime();
    const user = await createApplication(runtime).requireUser(request.headers);
    const service = new BookingService(runtime.db);
    const p = new URL(request.url).searchParams;
    if (request.method !== "GET") {
      requireOrigin(request, runtime.origin);
      await limit(
        runtime.db,
        runtime.secret,
        "booking:" + publicId + ":" + user.id,
        60,
        60,
      );
    }
    if (resource === "booking-config")
      return json(
        request.method === "GET"
          ? await service.catalog(user.id, publicId)
          : await service.configure(
              user.id,
              publicId,
              await readJson(request, 20000),
            ),
      );
    if (resource === "booking-slots")
      return json(
        await service.slots(
          user.id,
          publicId,
          p.get("service") ?? "",
          p.get("specialist") ?? "",
          p.get("date") ?? "",
          p.get("exclude") ?? undefined,
        ),
      );
    if (request.method === "GET")
      return json(
        await service.list(
          user.id,
          publicId,
          p.get("from") ?? undefined,
          p.get("until") ?? undefined,
          Number(p.get("page") ?? 0),
        ),
      );
    if (request.method === "POST")
      return json(
        await service.create(user.id, publicId, await readJson(request)),
        201,
      );
    if (request.method === "PATCH" && bookingId)
      return json(
        await service.change(
          user.id,
          publicId,
          bookingId,
          await readJson(request),
        ),
      );
    throw new AppError(405, "METHOD_NOT_ALLOWED", "Действие недоступно.");
  });
}
