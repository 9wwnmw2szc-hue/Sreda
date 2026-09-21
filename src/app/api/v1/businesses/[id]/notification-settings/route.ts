import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { respond, requireOrigin, readJson, json } from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import { NotificationSettings } from "@/server/notifications/settings";
async function handle(request: Request, id: string) {
  return respond(request, async () => {
    const r = getRuntime();
    const u = await createApplication(r).requireUser(request.headers);
    const s = new NotificationSettings(r.db);
    if (request.method === "GET") return json(await s.get(u.id, id));
    requireOrigin(request, r.origin);
    await limit(r.db, r.secret, "notification-settings:" + u.id, 20, 60);
    return json(await s.save(u.id, id, await readJson(request)));
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
