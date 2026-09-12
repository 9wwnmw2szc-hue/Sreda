import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return createApplication(getRuntime()).invitations(request); }
