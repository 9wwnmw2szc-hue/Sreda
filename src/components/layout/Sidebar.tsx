"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import {
  APP_NAME,
  APP_TAGLINE,
  NAV_ITEMS,
  SUPPORT_TELEGRAM_URL,
} from "@/config/navigation";
import { cn } from "@/lib/cn";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/45 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        id="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[216px] flex-col border-r border-white/[0.04] bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] transition-transform duration-300 max-[1359px]:w-[200px] lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Основная навигация"
      >
        <div className="flex items-start justify-between px-5 pt-7 pb-5">
          <div>
            <Link
              href="/dashboard"
              className="text-[1.65rem] leading-none font-semibold tracking-tight text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              onClick={onClose}
            >
              {APP_NAME}
            </Link>
            <p className="mt-1.5 text-[13px] text-[var(--sidebar-muted)]">
              {APP_TAGLINE}
            </p>
          </div>

          <button
            type="button"
            className="rounded-xl p-2 text-[var(--sidebar-muted)] transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] lg:hidden"
            onClick={onClose}
            aria-label="Закрыть меню"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Разделы">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "group flex min-h-[44px] items-center gap-3 rounded-[18px] px-3.5 text-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                      isActive
                        ? "bg-[var(--sidebar-active)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                        : "text-[var(--sidebar-muted)] hover:bg-white/[0.04] hover:text-white",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 stroke-[1.75]",
                        isActive ? "text-white" : "text-[var(--sidebar-icon)]",
                      )}
                      aria-hidden
                    />
                    <span className="flex-1">{item.label}</span>
                    {typeof item.badge === "number" ? (
                      <span className="rounded-full bg-[var(--danger)] px-2 py-0.5 text-xs font-medium text-white">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mx-3 mb-4 rounded-[18px] border border-white/[0.05] bg-white/[0.03] px-3.5 py-3.5">
          <p className="text-sm font-medium text-white">Нужна помощь?</p>
          <p className="mt-1 text-[13px] text-[var(--sidebar-muted)]">Мы рядом.</p>
          <a
            href={SUPPORT_TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.11] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Написать
          </a>
        </div>
      </aside>
    </>
  );
}
