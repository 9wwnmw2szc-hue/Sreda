import { analyticsHandler } from "@/server/http/analytics-handler";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id, fileId } = await params;
  return analyticsHandler(request, id, "file-rows", fileId);
}
