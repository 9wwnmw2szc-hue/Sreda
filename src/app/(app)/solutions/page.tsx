import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export const metadata: Metadata = {
  title: "Мои решения",
};

export default function SolutionsPage() {
  return (
    <PagePlaceholder
      title="Что хотите поручить Среде?"
      description="Каталог готовых решений: приём заявок, продажи, автопостинг и онлайн-запись."
      stageHint="Каталог и wizard подключения — этап 3."
    />
  );
}
