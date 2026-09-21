import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { json, requireOrigin, respond } from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import { VKService } from "@/server/vk/service";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(request, async () => {
    const r = getRuntime();
    requireOrigin(request, r.origin);
    const user = await createApplication(r).requireUser(request.headers);
    await limit(r.db, r.secret, "vk-start:" + user.id, 5, 60);
    return json(
      await new VKService(r.db, r.secret, r.vkEnabled).start(
        user.id,
        (await params).id,
        r.origin,
      ),
    );
  });
}
