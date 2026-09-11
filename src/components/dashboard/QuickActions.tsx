import Link from "next/link";
import { PencilLine, ListFilter, Plus } from "lucide-react";
export function QuickActions({ onCatalog }: { onCatalog?: () => void }) {
  return (
    <section className="quick-actions" aria-label="Быстрые действия">
      <Link href="/posts" className="button button--primary">
        <PencilLine size={20} />
        Создать пост
      </Link>
      <Link href="/leads" className="button button--outline">
        <ListFilter size={20} />
        Открыть заявки
      </Link>
      <button onClick={onCatalog} className="button button--outline">
        <Plus size={20} />
        Добавить решение
      </button>
    </section>
  );
}
