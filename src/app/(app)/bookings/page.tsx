import { Suspense } from "react";
import { BookingsView } from "@/components/booking/BookingsView";
export const metadata = { title: "Онлайн-запись" };
export default function Page() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <BookingsView />
    </Suspense>
  );
}
