import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { respond, requireOrigin, readJson, json } from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import { IndustrySetupService } from "@/server/workspaces/industry";
import { LeadFormService } from "@/server/leads/forms";
import { industryPreset } from "@/lib/industryPresets";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(request, async () => {
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
  return respond(request, async () => {
    const r = getRuntime();
    requireOrigin(request, r.origin);
    const user = await createApplication(r).requireUser(request.headers);
    await limit(r.db, r.secret, "industry:" + user.id, 40, 60);
    const body = await readJson(request, 20000);
    const service = new IndustrySetupService(r.db);
    const id = (await params).id;
    const saved = await service.save(user.id, id, body);
    if (body.apply_lead_preset === true && saved.industry) {
      const preset = industryPreset(saved.industry);
      const fields = preset?.leadFormPreset;
      if (fields?.length) {
        const leads = new LeadFormService(r.db);
        const result = await leads.applyIndustryPreset(user.id, id, fields);
        return json({ ...saved, lead_form_preset: result });
      }
    }
    return json(saved);
  });
}
