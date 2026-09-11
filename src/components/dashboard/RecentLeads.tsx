"use client";
import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";
import { formatRelativeDateTime, initialsFromName } from "@/lib/format";
import type { Lead } from "@/types";
export function RecentLeads({
  leads,
  onSelect,
}: {
  leads: Lead[];
  onSelect?: (lead: Lead) => void;
}) {
  const newCount = leads.filter((lead) => lead.status === "new").length;
  return (
    <section className="panel leads-panel">
      <div className="panel-heading">
        <h2>
          <span className="desktop-only">Последние заявки</span>
          <span className="mobile-only">Последние заявки</span>
          {newCount > 0 && (
            <span
              className="count-badge"
              aria-label={`Новых среди последних заявок: ${newCount}`}
            >
              {newCount}
            </span>
          )}
        </h2>
        <Link href="/leads" className="text-link">
          Все заявки
          <ChevronRight size={16} />
        </Link>
      </div>
      {leads.length ? (
        <ul className="lead-list">
          {leads.slice(0, 3).map((lead, index) => (
            <li key={lead.id}>
              <button className="lead-row" onClick={() => onSelect?.(lead)}>
                <span className={`initial-avatar initial-avatar--${index % 3}`}>
                  {initialsFromName(lead.name)}
                </span>
                <span className="lead-row__body">
                  <strong>{lead.name}</strong>
                  <span>{lead.message}</span>
                </span>
                <span className="lead-row__meta">
                  <time dateTime={lead.createdAt}>
                    {formatRelativeDateTime(lead.createdAt)}
                  </time>
                  <span className={`status-chip status-chip--${lead.status}`}>
                    {lead.status === "new"
                      ? "Новая"
                      : lead.status === "processing"
                        ? "В работе"
                        : "Закрыта"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <Inbox size={26} />
          <p>Новые обращения появятся здесь.</p>
        </div>
      )}
    </section>
  );
}
