import Link from "next/link";
import { Bot, FilePlus2, Inbox, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

const ACTIONS = [
  {
    href: "/posts",
    label: "Создать пост",
    icon: FilePlus2,
  },
  {
    href: "/leads",
    label: "Посмотреть заявки",
    icon: Inbox,
  },
  {
    href: "/connections",
    label: "Настроить бота",
    icon: Bot,
  },
  {
    href: "/solutions",
    label: "Подключить решение",
    icon: Plus,
    emphasize: true,
  },
] as const;

export function QuickActions() {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
        Быстрые действия
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          const emphasize = "emphasize" in action && action.emphasize;

          return (
            <Link
              key={action.href + action.label}
              href={action.href}
              className={cn(
                "inline-flex h-[58px] items-center justify-center gap-2 rounded-[20px] border px-4 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                emphasize
                  ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-white hover:opacity-90"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--text-muted)] hover:bg-[var(--surface-elevated)]",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {action.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
