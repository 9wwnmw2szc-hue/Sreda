import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { respond } from "@/server/http/errors";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return respond(request, () => createApplication(getRuntime()).me(request));
}
