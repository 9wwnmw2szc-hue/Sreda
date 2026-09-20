import { getRuntime } from "@/server/runtime";
import { createBusinessDeletionHandler } from "@/server/http/business-deletion-handler";
import { respond } from "@/server/http/errors";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  return respond(() =>
    createBusinessDeletionHandler(getRuntime())(request, id),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  return respond(() =>
    createBusinessDeletionHandler(getRuntime())(request, id),
  );
}
