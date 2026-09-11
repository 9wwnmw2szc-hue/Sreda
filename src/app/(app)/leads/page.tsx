import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export const metadata: Metadata = {
  title: "Заявки",
};

export default function LeadsPage() {
  return (
    <PagePlaceholder
      title="Заявки"
      description="Простой список обращений клиентов: новые, в работе и закрытые. Без CRM и сложных воронок."
      stageHint="Страница заявок — этап 3."
    />
  );
}
