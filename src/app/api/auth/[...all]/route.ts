import { getRuntime } from "@/server/runtime";
import { createAuthHandler } from "@/server/http/auth-handler";
import { respond } from "@/server/http/errors";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return respond(() => createAuthHandler(getRuntime())(request));
}
