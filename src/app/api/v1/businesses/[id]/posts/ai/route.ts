import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { respond, requireOrigin, readJson, json } from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import { requireBusiness } from "@/server/access/permissions";
import { generatePost } from "@/server/ai/posts";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const r = getRuntime();
    requireOrigin(request, r.origin);
    const user = await createApplication(r).requireUser(request.headers);
    const b = await requireBusiness(
      r.db,
      user.id,
      (await params).id,
      "posts.manage",
    );
    await limit(r.db, r.secret, "ai:user:" + user.id, 5, 60);
    await limit(r.db, r.secret, "ai:business:" + b.id, 100, 86400);
    return json(await generatePost(await readJson(request, 20000)));
  });
}
