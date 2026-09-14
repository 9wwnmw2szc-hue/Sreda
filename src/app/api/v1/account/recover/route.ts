import { getRuntime } from "@/server/runtime";
import { createRecoveryHandler } from "@/server/http/recovery-handler";
import { respond } from "@/server/http/errors";
export const dynamic = "force-dynamic";
export function POST(request: Request) { return respond(() => createRecoveryHandler(getRuntime())(request, "recover")); }
