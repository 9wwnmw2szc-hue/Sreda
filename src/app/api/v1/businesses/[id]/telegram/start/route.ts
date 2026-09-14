import { getRuntime } from "@/server/runtime";
import { createSolutionHandler } from "@/server/http/solution-handler";
import { respond } from "@/server/http/errors";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return respond(async () => createSolutionHandler(getRuntime())(request, (await params).id, "start")); }
