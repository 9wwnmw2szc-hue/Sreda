"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Crown, Lock, X } from "lucide-react";
import { NAV_ITEMS, SECONDARY_NAV_ITEMS } from "@/config/navigation";
import { Brand } from "@/components/ui/Brand";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { useCurrentBusiness } from "@/hooks/useCurrentBusiness";
import { APP_NAME } from "@/config/brand";
import { SignOutButton } from "@/components/account/SignOutButton";
import { apiRequest } from "@/lib/apiClient";
import { isDemoMode } from "@/lib/dataMode";

const SOLUTION_BY_HREF: Record<string, string> = {
  "/orders": "sol_orders",
  "/leads": "sol_leads",
  "/bookings": "sol_booking",
  "/messages": "sol_admin_messages",
  "/posts": "sol_autopost",
};

function allSolutionLocks(): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const href of Object.keys(SOLUTION_BY_HREF)) next[href] = true;
  return next;
}

export function Sidebar({
  onClose,
  mobile = false,
}: {
  onClose?: () => void;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const { business, businesses, setBusinessId } = useCurrentBusiness();
  const items = mobile ? [...NAV_ITEMS, ...SECONDARY_NAV_ITEMS] : NAV_ITEMS;
  const [lockState, setLockState] = useState<{
    id: string;
    locked: Record<string, boolean>;
  } | null>(null);
  const locked =
    lockState && business?.id === lockState.id ? lockState.locked : {};

  useEffect(() => {
    if (!business?.id || isDemoMode) return;
    const businessId = business.id;
    let alive = true;
    void apiRequest<
      { solutionId: string; status: string; entitlementStatus?: string }[]
    >(`/api/v1/businesses/${businessId}/solutions`)
      .then((rows) => {
        if (!alive) return;
        const next: Record<string, boolean> = {};
        for (const [href, solutionId] of Object.entries(SOLUTION_BY_HREF)) {
          const row = rows.find((item) => item.solutionId === solutionId);
          next[href] =
            !row ||
            row.status === "available" ||
            row.status === "unavailable" ||
            row.entitlementStatus === "disabled";
        }
        setLockState({ id: businessId, locked: next });
      })
      .catch(() => {
        if (alive)
          setLockState({ id: businessId, locked: allSolutionLocks() });
      });
    return () => {
      alive = false;
    };
  }, [business?.id]);

  return (
    <aside
      className={`sidebar${mobile ? " sidebar--mobile" : ""}`}
      aria-label="Основная навигация"
    >
      <div className="sidebar__brand">
        <Brand showTagline={false} />
        {mobile && (
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Закрыть меню"
          >
            <X size={22} />
          </button>
        )}
      </div>

      <div className="sidebar__switcher">
        <BusinessSwitcher
          businesses={businesses}
          currentBusiness={business}
          onSelect={(id) => {
            setBusinessId(id);
            onClose?.();
          }}
        />
      </div>

      <nav className="sidebar__nav">
        <ul>
          {items.map((item) => {
            const Icon = item.icon;
            const isLocked = Boolean(locked[item.href]);
            const href = isLocked ? "/solutions" : item.href;
            const active =
              !isLocked &&
              (pathname === item.href || pathname.startsWith(`${item.href}/`));
            return (
              <li key={item.href}>
                <Link
                  href={href}
                  className={`sidebar__link${active ? " is-active" : ""}${isLocked ? " is-locked" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={onClose}
                >
                  <Icon size={20} strokeWidth={1.7} aria-hidden />
                  <span>{item.label}</span>
                  {isLocked ? (
                    <Lock className="sidebar__lock" size={14} aria-label="Подключить" />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar__footer">
        <Link href="/billing" className="sidebar__plan" onClick={onClose}>
          <span className="sidebar__plan-icon" aria-hidden>
            <Crown size={18} />
          </span>
          <span>
            <strong>Тариф</strong>
            <small>Условия и возможности роста</small>
          </span>
        </Link>
        <div className="sidebar__sign-out">
          <SignOutButton variant="sidebar" onSignedOut={onClose} />
        </div>
        <small className="sidebar__copy">
          {APP_NAME} © {new Date().getFullYear()}
        </small>
      </div>
    </aside>
  );
}
