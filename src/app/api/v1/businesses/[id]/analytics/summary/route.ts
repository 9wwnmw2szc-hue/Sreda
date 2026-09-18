import { analyticsHandler } from "@/server/http/analytics-handler";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return analyticsHandler(request, (await params).id, "summary");
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return analyticsHandler(request, (await params).id, "summary");
}
