import { ordersHandler } from "@/server/http/orders-handler";
export const dynamic = "force-dynamic";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; categoryId: string }> },
) {
  const p = await params;
  return ordersHandler(request, p.id, "categories", p.categoryId);
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; categoryId: string }> },
) {
  const p = await params;
  return ordersHandler(request, p.id, "categories", p.categoryId);
}
