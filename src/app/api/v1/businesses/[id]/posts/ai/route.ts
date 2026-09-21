import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { respond, requireOrigin, readJson, json } from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import { requireBusiness } from "@/server/access/permissions";
import { generatePost } from "@/server/ai/posts";
import {
  assertAiUsageAllowed,
  recordAiUsage,
} from "@/server/ai/usage";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(request, async () => {
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
    await assertAiUsageAllowed(r.db, b.id);
    const result = await generatePost(await readJson(request, 20000), {
      db: r.db,
      businessId: b.id,
    });
    await recordAiUsage(r.db, {
      businessId: b.id,
      feature: "posts.draft",
      model: process.env.AI_MODEL,
    });
    return json(result);
  });
}
