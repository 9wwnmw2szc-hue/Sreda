import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; invitationId: string }> }) { const p = await params; return createApplication(getRuntime()).invitations(request, p.id, p.invitationId); }
