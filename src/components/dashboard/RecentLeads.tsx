import Link from "next/link";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { LeadStatusPill } from "@/components/ui/StatusPill";
import { formatRelativeDateTime, initialsFromName } from "@/lib/format";
import { leadStatusLabel } from "@/lib/labels";
import type { Lead } from "@/types";

interface RecentLeadsProps {
  leads: Lead[];
}

export function RecentLeads({ leads }: RecentLeadsProps) {
  return (
    <section className="dashboard-lower-card rounded-[24px] border border-[var(--border-light)] bg-[var(--surface)] p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
          Последние заявки
        </h2>
        <Link
          href="/leads"
          className="text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        >
          Все заявки →
        </Link>
      </div>

      <ul className="divide-y divide-[var(--border-light)]">
        {leads.length === 0 ? (
          <li className="py-6 text-sm text-[var(--text-muted)]">
            Пока нет заявок
          </li>
        ) : (
          leads.map((lead) => (
            <li
              key={lead.id}
              className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-xs font-semibold text-[var(--text-secondary)]"
                  aria-hidden
                >
                  {initialsFromName(lead.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {lead.name}
                  </p>
                  <p className="truncate text-sm text-[var(--text-secondary)]">
                    {lead.message ?? "Без сообщения"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <PlatformBadge platform={lead.source} />
                <span className="text-xs text-[var(--text-muted)]">
                  {formatRelativeDateTime(lead.createdAt)}
                </span>
                <LeadStatusPill
                  label={leadStatusLabel(lead.status)}
                  status={lead.status}
                />
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
