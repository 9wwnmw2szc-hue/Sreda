import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export const metadata: Metadata = {
  title: "Тариф и оплата",
};

export default function BillingPage() {
  return (
    <PagePlaceholder
      title="Тариф и оплата"
      description="Текущий тариф, активные решения и следующее списание. Без реальных платежей на этом этапе."
      stageHint="Страница тарифа — этап 3."
    />
  );
}
