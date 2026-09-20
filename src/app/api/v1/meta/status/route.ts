import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { json, respond } from "@/server/http/errors";
import { metaPublicStatus } from "@/server/meta/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return respond(async () => {
    await createApplication(getRuntime()).requireUser(request.headers);
    return json(metaPublicStatus());
  });
}
