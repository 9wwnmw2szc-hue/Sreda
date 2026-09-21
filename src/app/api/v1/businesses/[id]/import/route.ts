import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import {
  json,
  readJson,
  requireOrigin,
  respond,
} from "@/server/http/errors";
import { EntityImportService } from "@/server/import/entity-import";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(request, async () => {
    const r = getRuntime();
    requireOrigin(request, r.origin);
    const user = await createApplication(r).requireUser(request.headers);
    const publicId = (await params).id;
    const body = await readJson(request, 2_000_000);
    const entity = body.entity === "products" ? "products" : "clients";
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const service = new EntityImportService(r.db);
    if (body.preview === true || body.dryRun === true)
      return json(service.preview(entity, rows));
    return json(await service.commit(user.id, publicId, entity, rows));
  });
}
