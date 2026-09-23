"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ShoppingBag,
  Inbox,
  CalendarDays,
  PencilLine,
  MessageCircle,
  ChevronRight,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { useCurrentBusiness } from "@/hooks/useCurrentBusiness";
import { apiRequest } from "@/lib/apiClient";
import { isDemoMode } from "@/lib/dataMode";

type Action = {
  href: string;
  label: string;
  tone: "orders" | "leads" | "booking" | "autopost" | "messages";
  Icon: LucideIcon;
  desktopOnly?: boolean;
  solutionId: string;
};

/** Labels match navigation (no create-flow query params exist yet). */
const ACTIONS: Action[] = [
  {
    href: "/orders",
    label: "Заказы",
    tone: "orders",
    Icon: ShoppingBag,
    solutionId: "sol_orders",
  },
  {
    href: "/leads",
    label: "Заявки",
    tone: "leads",
    Icon: Inbox,
    solutionId: "sol_leads",
  },
  {
    href: "/bookings",
    label: "Запись",
    tone: "booking",
    Icon: CalendarDays,
    solutionId: "sol_booking",
  },
  {
    href: "/posts",
    label: "Посты",
    tone: "autopost",
    Icon: PencilLine,
    solutionId: "sol_autopost",
  },
  {
    href: "/messages",
    label: "Сообщения",
    tone: "messages",
    Icon: MessageCircle,
    desktopOnly: true,
    solutionId: "sol_admin_messages",
  },
];

type Gate = "open" | "paused" | "locked";

function gateFor(
  row: { status: string; entitlementStatus?: string } | undefined,
): Gate {
  if (!row) return "locked";
  if (
    row.status === "available" ||
    row.status === "unavailable" ||
    row.entitlementStatus === "disabled" ||
    row.entitlementStatus === "absent" ||
    row.entitlementStatus === "expired"
  )
    return "locked";
  if (row.entitlementStatus === "paused" || row.status === "paused")
    return "paused";
  if (row.status === "active" || row.status === "setup_required") return "open";
  return "locked";
}

export function QuickActions() {
  const { business } = useCurrentBusiness();
  const [gates, setGates] = useState<{
    id: string;
    byHref: Record<string, Gate>;
  } | null>(null);

  useEffect(() => {
    if (!business?.id || isDemoMode) return;
    const businessId = business.id;
    let alive = true;
    void apiRequest<
      { solutionId: string; status: string; entitlementStatus?: string }[]
    >(`/api/v1/businesses/${businessId}/solutions`)
      .then((rows) => {
        if (!alive) return;
        const byHref: Record<string, Gate> = {};
        for (const action of ACTIONS) {
          const row = rows.find((item) => item.solutionId === action.solutionId);
          byHref[action.href] = gateFor(row);
        }
        setGates({ id: businessId, byHref });
      })
      .catch(() => {
        if (!alive) return;
        const byHref: Record<string, Gate> = {};
        for (const action of ACTIONS) byHref[action.href] = "locked";
        setGates({ id: businessId, byHref });
      });
    return () => {
      alive = false;
    };
  }, [business?.id]);

  const byHref =
    gates && business?.id === gates.id ? gates.byHref : undefined;

  return (
    <section className="soty-quick" aria-labelledby="soty-quick-title">
      <div className="soty-section-head">
        <h2 id="soty-quick-title">Быстрые действия</h2>
        <p>Переход к основным разделам</p>
      </div>
      <ul className="soty-quick__grid">
        {ACTIONS.map(({ href, label, tone, Icon, desktopOnly }) => {
          const gate = byHref?.[href] ?? (isDemoMode ? "open" : "locked");
          if (gate === "locked") {
            return (
              <li
                key={href}
                className={
                  desktopOnly
                    ? "soty-quick__item soty-quick__item--desktop"
                    : "soty-quick__item"
                }
              >
                <Link
                  href="/solutions"
                  className={`soty-quick__btn soty-quick__btn--${tone} is-locked`}
                  aria-label={`${label}: подключить`}
                >
                  <span className="soty-quick__icon" aria-hidden>
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <span className="soty-quick__label">{label}</span>
                  <Lock size={14} className="soty-quick__chevron" aria-hidden />
                </Link>
              </li>
            );
          }
          const muted = gate === "paused";
          return (
            <li
              key={href}
              className={
                desktopOnly
                  ? "soty-quick__item soty-quick__item--desktop"
                  : "soty-quick__item"
              }
            >
              <Link
                href={muted ? "/solutions" : href}
                className={`soty-quick__btn soty-quick__btn--${tone}${muted ? " is-muted" : ""}`}
              >
                <span className="soty-quick__icon" aria-hidden>
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <span className="soty-quick__label">{label}</span>
                <ChevronRight
                  size={16}
                  className="soty-quick__chevron"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
