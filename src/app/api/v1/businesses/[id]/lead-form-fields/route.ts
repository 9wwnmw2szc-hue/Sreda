import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { AppError, json, readJson, requireOrigin, respond } from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import { LeadFormService } from "@/server/leads/forms";

export const dynamic = "force-dynamic";

async function handle(request: Request, publicId: string, fieldId?: string) {
  return respond(request, async () => {
    const runtime = getRuntime();
    const user = await createApplication(runtime).requireUser(request.headers);
    const service = new LeadFormService(runtime.db);
    if (request.method !== "GET") {
      requireOrigin(request, runtime.origin);
      await limit(
        runtime.db,
        runtime.secret,
        "lead-fields:" + publicId + ":" + user.id,
        60,
        60,
      );
    }
    if (request.method === "GET" && !fieldId)
      return json(await service.list(user.id, publicId));
    if (request.method === "POST" && !fieldId)
      return json(
        await service.save(user.id, publicId, await readJson(request, 8000)),
        201,
      );
    if ((request.method === "PATCH" || request.method === "PUT") && fieldId)
      return json(
        await service.save(
          user.id,
          publicId,
          await readJson(request, 8000),
          fieldId,
        ),
      );
    if (request.method === "DELETE" && fieldId)
      return json(await service.remove(user.id, publicId, fieldId));
    throw new AppError(405, "METHOD_NOT_ALLOWED", "Действие недоступно.");
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(request, (await params).id);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(request, (await params).id);
}
