"use client";

import { Suspense, use, useMemo } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Inbox,
  MessageCircle,
  CalendarDays,
  ShoppingBag,
} from "lucide-react";
import { apiRequest } from "@/lib/apiClient";

type Kpi = {
  id: string;
  label: string;
  display: string;
  value?: number;
  delta?: { percent: number | null };
  kind?: string;
};

type Summary = {
  kpis: Kpi[];
  href: string;
};

const cache = new Map<string, Promise<Summary>>();

function summaryPromise(businessId: string) {
  let p = cache.get(businessId);
  if (!p) {
    p = apiRequest<Summary>(
      `/api/v1/businesses/${businessId}/analytics/summary`,
    ).catch(() => ({ kpis: [], href: "/analytics" }));
    cache.set(businessId, p);
  }
  return p;
}

const ICON_BY_ID: Record<string, typeof ShoppingBag> = {
  orders: ShoppingBag,
  leads: Inbox,
  bookings: CalendarDays,
  messages: MessageCircle,
  new_clients: Inbox,
};

function pickIcon(id: string) {
  if (id.startsWith("revenue")) return ShoppingBag;
  if (id.includes("order")) return ShoppingBag;
  if (id.includes("lead")) return Inbox;
  if (id.includes("book")) return CalendarDays;
  if (id.includes("message") || id.includes("commun")) return MessageCircle;
  return ICON_BY_ID[id] ?? ShoppingBag;
}

function toneClass(id: string) {
  if (id.includes("order") || id.startsWith("revenue")) return "orders";
  if (id.includes("lead")) return "leads";
  if (id.includes("book")) return "booking";
  if (id.includes("message") || id.includes("commun")) return "messages";
  return "orders";
}

function SummaryBody({ businessId }: { businessId: string }) {
  const data = use(summaryPromise(businessId));
  const kpis = useMemo(() => (data.kpis ?? []).slice(0, 4), [data.kpis]);
  if (!kpis.length) {
    return (
      <section className="soty-kpi-grid" aria-label="Показатели">
        <div className="soty-kpi-card soty-kpi-card--empty">
          <p>Показатели появятся после первых заказов, заявок и записей.</p>
          <Link href="/analytics" className="text-link">
            Открыть аналитику
            <ChevronRight size={16} />
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section className="soty-kpi-grid" aria-label="Показатели">
      {kpis.map((kpi) => {
        const Icon = pickIcon(kpi.id);
        const pct = kpi.delta?.percent;
        return (
          <Link
            key={kpi.id}
            href={data.href}
            className={`soty-kpi-card soty-kpi-card--${toneClass(kpi.id)}`}
          >
            <span className="soty-kpi-card__icon" aria-hidden>
              <Icon size={18} strokeWidth={1.7} />
            </span>
            <strong className="soty-kpi-card__value">{kpi.display}</strong>
            <span className="soty-kpi-card__label">{kpi.label}</span>
            {pct != null && pct !== 0 ? (
              <span
                className={`soty-kpi-card__trend ${pct > 0 ? "is-up" : "is-down"}`}
              >
                {pct > 0 ? "↑" : "↓"} {pct > 0 ? "+" : ""}
                {pct}%
              </span>
            ) : (
              <span className="soty-kpi-card__trend is-flat">—</span>
            )}
            <ChevronRight className="soty-kpi-card__chevron" size={16} />
          </Link>
        );
      })}
    </section>
  );
}

export function DashboardKpis({ businessId }: { businessId: string }) {
  return (
    <Suspense
      fallback={<section className="soty-kpi-grid" aria-hidden />}
    >
      <SummaryBody businessId={businessId} />
    </Suspense>
  );
}
