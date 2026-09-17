import { Suspense } from "react";
import { OrdersView } from "@/components/orders/OrdersView";

export default function OrdersPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <OrdersView />
    </Suspense>
  );
}
