import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { respond, requireOrigin, readJson, json } from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import { AiInterviewService } from "@/server/ai/interview";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(request, async () => {
    const r = getRuntime();
    const user = await createApplication(r).requireUser(request.headers);
    const service = new AiInterviewService(r.db);
    return json(await service.get(user.id, (await params).id));
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(request, async () => {
    const r = getRuntime();
    requireOrigin(request, r.origin);
    const user = await createApplication(r).requireUser(request.headers);
    await limit(r.db, r.secret, "ai:interview:" + user.id, 30, 60);
    const body = await readJson(request, 20000);
    const service = new AiInterviewService(r.db);
    const action = String(body.action ?? "answer");
    const id = (await params).id;
    if (action === "answer")
      return json(await service.answer(user.id, id, body));
    if (action === "confirm")
      return json(
        await service.confirm(user.id, id, body.apply !== false),
      );
    if (action === "suggest_text")
      return json(
        await service.suggestTexts(user.id, id, String(body.kind ?? "")),
      );
    if (action === "suggest_schedule")
      return json(
        await service.suggestSchedule(
          user.id,
          id,
          String(body.notes ?? ""),
        ),
      );
    return json(await service.get(user.id, id));
  });
}
