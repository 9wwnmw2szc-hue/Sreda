"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crown, X } from "lucide-react";
import { NAV_ITEMS, SECONDARY_NAV_ITEMS } from "@/config/navigation";
import { Brand } from "@/components/ui/Brand";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { useCurrentBusiness } from "@/hooks/useCurrentBusiness";
import { APP_NAME } from "@/config/brand";

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
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`sidebar__link${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={onClose}
                >
                  <Icon size={20} strokeWidth={1.7} aria-hidden />
                  <span>{item.label}</span>
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
        <small className="sidebar__copy">
          {APP_NAME} © {new Date().getFullYear()}
        </small>
      </div>
    </aside>
  );
}
