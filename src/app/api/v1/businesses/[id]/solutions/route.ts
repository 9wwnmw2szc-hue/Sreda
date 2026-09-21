import { getRuntime } from "@/server/runtime";
import { createSolutionHandler } from "@/server/http/solution-handler";
import { respond } from "@/server/http/errors";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(request, async () =>
    createSolutionHandler(getRuntime())(
      request,
      (await params).id,
      "solutions",
    ),
  );
}

export const POST = GET;
