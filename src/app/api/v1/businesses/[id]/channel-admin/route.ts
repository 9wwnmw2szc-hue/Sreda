import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import {
  respond,
  requireOrigin,
  readJson,
  json,
  AppError,
} from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import { ChannelAdminBindingService } from "@/server/channel-admin/binding";

async function handle(request: Request, id: string) {
  return respond(async () => {
    const r = getRuntime();
    const u = await createApplication(r).requireUser(request.headers);
    const service = new ChannelAdminBindingService(r.db);
    if (request.method === "GET") return json(await service.list(u.id, id));
    requireOrigin(request, r.origin);
    await limit(r.db, r.secret, "channel-admin:" + u.id, 20, 60);
    const body = await readJson(request);
    const action = body.action;
    if (action === "challenge")
      return json(
        await service.createWebChallenge(u.id, id, body.platform),
      );
    if (action === "revoke")
      return json(
        await service.revoke(
          u.id,
          id,
          body.platform,
          typeof body.targetUserId === "string"
            ? body.targetUserId
            : undefined,
        ),
      );
    throw new AppError(400, "INVALID_ACTION", "Действие недоступно.");
  });
}

export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(r, (await params).id);
}

export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(r, (await params).id);
}
