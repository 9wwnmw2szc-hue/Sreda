import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import {
  json,
  readJson,
  requireOrigin,
  respond,
  AppError,
} from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import { ClientService } from "@/server/clients/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const businessId = (await params).id;
  return respond(request, async () => {
    const runtime = getRuntime();
    const user = await createApplication(runtime).requireUser(request.headers);
    requireOrigin(request, runtime.origin);
    await limit(
      runtime.db,
      runtime.secret,
      "crm-merge:" + businessId + ":" + user.id,
      20,
      60,
    );
    if (request.method !== "POST")
      throw new AppError(405, "METHOD_NOT_ALLOWED", "Действие недоступно.");
    const body = await readJson(request);
    return json(
      await new ClientService(runtime.db).merge(user.id, businessId, body),
    );
  });
}
