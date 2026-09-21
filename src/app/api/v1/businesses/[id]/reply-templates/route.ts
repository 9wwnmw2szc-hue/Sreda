import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import {
  AppError,
  json,
  readJson,
  requireOrigin,
  respond,
} from "@/server/http/errors";
import { ReplyTemplateService } from "@/server/communications/reply-templates";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(request, async () => {
    const r = getRuntime();
    const user = await createApplication(r).requireUser(request.headers);
    return json(
      await new ReplyTemplateService(r.db).list(user.id, (await params).id),
    );
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(request, async () => {
    const r = getRuntime();
    requireOrigin(request, r.origin);
    const user = await createApplication(r).requireUser(request.headers);
    const body = await readJson(request);
    const service = new ReplyTemplateService(r.db);
    if (body.action === "archive") {
      if (typeof body.id !== "string")
        throw new AppError(400, "INVALID_TEMPLATE", "Укажите шаблон.");
      return json(
        await service.archive(user.id, (await params).id, body.id),
      );
    }
    return json(await service.save(user.id, (await params).id, body));
  });
}
