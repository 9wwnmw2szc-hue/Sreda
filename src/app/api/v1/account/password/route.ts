import { getRuntime } from "@/server/runtime";
import { createPasswordHandler } from "@/server/http/password-handler";
import { respond } from "@/server/http/errors";
export const dynamic = "force-dynamic";
export function POST(request: Request) { return respond(() => createPasswordHandler(getRuntime())(request)); }
