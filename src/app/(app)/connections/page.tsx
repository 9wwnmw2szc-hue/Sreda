import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export const metadata: Metadata = {
  title: "Подключения",
};

export default function ConnectionsPage() {
  return (
    <PagePlaceholder
      title="Ваши площадки"
      description="Telegram и ВКонтакте, подключённые к текущему бизнесу."
      stageHint="Страница площадок — этап 3."
    />
  );
}
