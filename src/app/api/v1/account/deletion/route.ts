import { getRuntime } from "@/server/runtime";
import { createAccountDeletionHandler } from "@/server/http/account-deletion-handler";
import { respond } from "@/server/http/errors";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return respond(() => createAccountDeletionHandler(getRuntime())(request));
}

export function POST(request: Request) {
  return respond(() => createAccountDeletionHandler(getRuntime())(request));
}
