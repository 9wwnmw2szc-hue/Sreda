import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { respond, requireOrigin, readJson, json } from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import { IndustrySetupService } from "@/server/workspaces/industry";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const r = getRuntime();
    const user = await createApplication(r).requireUser(request.headers);
    const service = new IndustrySetupService(r.db);
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    if (q != null) return json({ results: service.search(q) });
    return json(await service.get(user.id, (await params).id));
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const r = getRuntime();
    requireOrigin(request, r.origin);
    const user = await createApplication(r).requireUser(request.headers);
    await limit(r.db, r.secret, "industry:" + user.id, 40, 60);
    const body = await readJson(request, 20000);
    const service = new IndustrySetupService(r.db);
    return json(await service.save(user.id, (await params).id, body));
  });
}
