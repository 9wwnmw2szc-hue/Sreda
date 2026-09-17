import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { AppError, json, readJson, requireOrigin, respond } from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import { LeadFormService } from "@/server/leads/forms";

export const dynamic = "force-dynamic";

async function handle(
  request: Request,
  publicId: string,
  fieldId: string,
) {
  return respond(async () => {
    const runtime = getRuntime();
    const user = await createApplication(runtime).requireUser(request.headers);
    const service = new LeadFormService(runtime.db);
    requireOrigin(request, runtime.origin);
    await limit(
      runtime.db,
      runtime.secret,
      "lead-fields:" + publicId + ":" + user.id,
      60,
      60,
    );
    if (request.method === "PATCH" || request.method === "PUT")
      return json(
        await service.save(
          user.id,
          publicId,
          await readJson(request, 8000),
          fieldId,
        ),
      );
    if (request.method === "DELETE")
      return json(await service.remove(user.id, publicId, fieldId));
    throw new AppError(405, "METHOD_NOT_ALLOWED", "Действие недоступно.");
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
  const p = await params;
  return handle(request, p.id, p.fieldId);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
  const p = await params;
  return handle(request, p.id, p.fieldId);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
  const p = await params;
  return handle(request, p.id, p.fieldId);
}
