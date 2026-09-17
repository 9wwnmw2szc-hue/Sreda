import { ordersHandler } from "@/server/http/orders-handler";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return ordersHandler(request, (await params).id, "cart");
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return ordersHandler(request, (await params).id, "cart");
}
