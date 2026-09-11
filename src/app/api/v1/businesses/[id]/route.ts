import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { respond } from "@/server/http/errors";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return respond(() => createApplication(getRuntime()).business(request, id));
}
