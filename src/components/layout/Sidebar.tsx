"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, X, ArrowUpRight } from "lucide-react";
import { NAV_ITEMS } from "@/config/navigation";
import { Brand } from "@/components/ui/Brand";
import { isDemoMode } from "@/lib/dataMode";
export function Sidebar({
  onClose,
  mobile = false,
}: {
  onClose?: () => void;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  return (
    <aside
      className={`sidebar${mobile ? " sidebar--mobile" : ""}`}
      aria-label="Основная навигация"
    >
      <div className="sidebar__brand">
        <Brand />
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
      <nav className="sidebar__nav">
        <ul>
          {NAV_ITEMS.map((item) => {
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
                  <Icon size={20} strokeWidth={1.6} aria-hidden />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="sidebar__footer">
        <Link href="/settings" className="sidebar__help" onClick={onClose}>
          <CircleHelp size={20} />
          <span>Помощь и поддержка</span>
          <ArrowUpRight size={16} />
        </Link>
        <p>
          <span className="demo-mark" />
          {isDemoMode ? "Демонстрация интерфейса" : "Ваше рабочее пространство"}
        </p>
        <small>Среда © 2026</small>
      </div>
    </aside>
  );
}
