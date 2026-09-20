import { getRuntime } from "@/server/runtime";
import { createAdminHandler } from "@/server/http/admin-handler";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return createAdminHandler(getRuntime()).audit(request);
}
