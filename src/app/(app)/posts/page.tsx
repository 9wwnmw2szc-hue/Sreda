import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export const metadata: Metadata = {
  title: "Посты",
};

export default function PostsPage() {
  return (
    <PagePlaceholder
      title="Посты"
      description="Создание и планирование публикаций сразу в Telegram и ВКонтакте."
      stageHint="Редактор постов — этап 3."
    />
  );
}
