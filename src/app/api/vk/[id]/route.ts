import { getRuntime } from "@/server/runtime";
import { VKService } from "@/server/vk/service";
import { json, readJson, respond } from "@/server/http/errors";
import { CommunicationService } from "@/server/communications/service";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const r = getRuntime();
    return json(await new VKService(r.db, r.secret, process.env.VK_WEBHOOKS_ENABLED === "true", new CommunicationService(r.db)).receive((await params).id, await readJson(request, 65536)));
  });
}
