import Link from "next/link";
import { Plus } from "lucide-react";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import type { Connection } from "@/types";

interface ConnectionsCardProps {
  connections: Connection[];
}

export function ConnectionsCard({ connections }: ConnectionsCardProps) {
  return (
    <section className="glass-panel w-full rounded-[22px] p-5 text-white">
      <p className="text-[11px] font-medium tracking-[0.08em] text-white/50 uppercase">
        Подключённые площадки
      </p>

      <ul className="mt-4 space-y-3.5">
        {connections.length === 0 ? (
          <li className="text-sm text-white/60">Пока нет площадок</li>
        ) : (
          connections.map((connection) => (
            <li
              key={connection.id}
              className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5"
            >
              <PlatformBadge platform={connection.platform} compact />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {connection.platform === "telegram"
                    ? "Telegram"
                    : connection.platform === "vk"
                      ? "ВКонтакте"
                      : "MAX"}
                </p>
                <p className="truncate text-xs text-white/55">
                  {connection.displayName}
                </p>
              </div>
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  connection.status === "connected"
                    ? "bg-[var(--success)]"
                    : "bg-[var(--warning)]"
                }`}
                aria-label={
                  connection.status === "connected" ? "Работает" : "Нужно внимание"
                }
              />
            </li>
          ))
        )}
      </ul>

      <Link
        href="/connections"
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-white/12 bg-transparent px-4 py-2.5 text-sm font-medium text-white/90 transition hover:bg-white/8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Подключить ещё
      </Link>
    </section>
  );
}
