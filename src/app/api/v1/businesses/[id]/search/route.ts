import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { json, respond, AppError } from "@/server/http/errors";
import { BusinessSearchService } from "@/server/search/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const businessId = (await params).id;
  return respond(request, async () => {
    const runtime = getRuntime();
    const user = await createApplication(runtime).requireUser(request.headers);
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const limit = url.searchParams.get("limit");
    if (request.method !== "GET")
      throw new AppError(405, "METHOD_NOT_ALLOWED", "Действие недоступно.");
    return json(
      await new BusinessSearchService(runtime.db).search(
        user.id,
        businessId,
        q,
        limit,
      ),
    );
  });
}
