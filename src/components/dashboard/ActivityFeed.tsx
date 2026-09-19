"use client";

import Link from "next/link";
import {
  ChevronRight,
  Inbox,
  ShoppingBag,
  CalendarDays,
  MessageCircle,
  PencilLine,
} from "lucide-react";
import { formatRelativeDateTime } from "@/lib/format";
import type { Lead } from "@/types";

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  at: string;
  tone: "orders" | "leads" | "booking" | "messages" | "autopost";
  href: string;
};

function IconFor({ tone }: { tone: ActivityItem["tone"] }) {
  const props = { size: 16, strokeWidth: 1.7 } as const;
  switch (tone) {
    case "orders":
      return <ShoppingBag {...props} />;
    case "booking":
      return <CalendarDays {...props} />;
    case "messages":
      return <MessageCircle {...props} />;
    case "autopost":
      return <PencilLine {...props} />;
    default:
      return <Inbox {...props} />;
  }
}

export function ActivityFeed({
  leads,
  onSelectLead,
}: {
  leads: Lead[];
  onSelectLead?: (lead: Lead) => void;
}) {
  const items: ActivityItem[] = leads.slice(0, 5).map((lead) => ({
    id: lead.id,
    title: `Новая заявка · ${lead.name}`,
    detail: lead.message?.trim() || "Клиент оставил заявку",
    at: lead.createdAt,
    tone: "leads",
    href: "/leads",
  }));

  return (
    <section className="panel soty-activity" aria-labelledby="soty-activity-title">
      <div className="panel-heading">
        <h2 id="soty-activity-title">Лента активности</h2>
        <Link href="/leads" className="text-link">
          Все события
          <ChevronRight size={16} />
        </Link>
      </div>
      {items.length ? (
        <ul className="soty-activity__list">
          {items.map((item) => {
            const lead = leads.find((l) => l.id === item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`soty-activity__row soty-activity__row--${item.tone}`}
                  onClick={() => {
                    if (lead && onSelectLead) onSelectLead(lead);
                  }}
                >
                  <span className="soty-activity__icon" aria-hidden>
                    <IconFor tone={item.tone} />
                  </span>
                  <span className="soty-activity__body">
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </span>
                  <time dateTime={item.at}>
                    {formatRelativeDateTime(item.at)}
                  </time>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty-state empty-state--compact">
          <Inbox size={24} />
          <p>
            <strong>Пока тихо</strong>
          </p>
          <p className="empty-copy">
            Заявки, заказы и записи появятся здесь по мере работы бизнеса.
          </p>
          <Link href="/solutions" className="button button--outline button--sm">
            Подключить решения
          </Link>
        </div>
      )}
    </section>
  );
}
