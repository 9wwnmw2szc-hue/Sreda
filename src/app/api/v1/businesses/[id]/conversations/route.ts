import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return createApplication(getRuntime()).conversations(request, (await params).id); }
