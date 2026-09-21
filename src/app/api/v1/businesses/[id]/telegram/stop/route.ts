import { getRuntime } from "@/server/runtime";
import { TelegramService } from "@/server/telegram/service";
import { json, requireOrigin, respond } from "@/server/http/errors";
import { createApplication } from "@/server/http/application";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(request, async () => {
    const r = getRuntime();
    requireOrigin(request, r.origin);
    const user = await createApplication(r).requireUser(request.headers);
    return json(
      await new TelegramService(
        r.db,
        r.secret,
        r.origin,
        r.telegramEnabled,
      ).stop(user.id, (await params).id),
    );
  });
}
