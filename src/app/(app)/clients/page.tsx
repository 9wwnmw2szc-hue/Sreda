import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export const metadata: Metadata = {
  title: "Клиенты",
};

export default function ClientsPage() {
  return (
    <PagePlaceholder
      title="Клиенты"
      description="Лёгкий список людей, которые писали бизнесу. Без CRM-функций."
      stageHint="Раздел клиентов появится позже."
    />
  );
}
