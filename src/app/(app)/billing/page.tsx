import type { Metadata } from "next";
import { BillingView } from "@/components/billing/BillingView";

export const metadata: Metadata = {
  title: "Тариф и оплата",
};

export default function BillingPage() {
  return <BillingView />;
}
