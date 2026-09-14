import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; conversationId: string }> }) { const p = await params; return createApplication(getRuntime()).conversations(request, p.id, p.conversationId); }
export async function POST(request: Request, { params }: { params: Promise<{ id: string; conversationId: string }> }) { const p = await params; return createApplication(getRuntime()).conversations(request, p.id, p.conversationId); }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; conversationId: string }> }) { const p = await params; return createApplication(getRuntime()).conversations(request, p.id, p.conversationId); }
