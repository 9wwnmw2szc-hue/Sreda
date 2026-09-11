import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export const metadata: Metadata = {
  title: "Настройки",
};

export default function SettingsPage() {
  return (
    <PagePlaceholder
      title="Настройки"
      description="Название бизнеса, аватар, данные владельца и уведомления."
      stageHint="Базовые настройки — этап 3."
    />
  );
}
