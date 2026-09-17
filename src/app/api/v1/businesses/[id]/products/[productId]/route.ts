import { ordersHandler } from "@/server/http/orders-handler";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  const p = await params;
  return ordersHandler(request, p.id, "products", p.productId);
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  const p = await params;
  return ordersHandler(request, p.id, "products", p.productId);
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  const p = await params;
  return ordersHandler(request, p.id, "products", p.productId);
}
