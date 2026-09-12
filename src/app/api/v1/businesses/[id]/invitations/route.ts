import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return createApplication(getRuntime()).invitations(request, (await params).id); }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return createApplication(getRuntime()).invitations(request, (await params).id); }
