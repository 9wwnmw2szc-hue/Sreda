import { getRuntime } from "@/server/runtime";
import { VKService } from "@/server/vk/service";
import { json, requireOrigin, respond } from "@/server/http/errors";
import { createApplication } from "@/server/http/application";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const r = getRuntime();
    requireOrigin(request, r.origin);
    const user = await createApplication(r).requireUser(request.headers);
    return json(
      await new VKService(r.db, r.secret, r.vkEnabled).stop(
        user.id,
        (await params).id,
      ),
    );
  });
}
