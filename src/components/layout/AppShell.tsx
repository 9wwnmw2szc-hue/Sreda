"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Home, Layers2, Inbox, Ellipsis } from "lucide-react";
import { BusinessProvider } from "@/hooks/useBusinessContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Brand } from "@/components/ui/Brand";
function AppShellInner({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    const dialog = menu.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
    const old = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, [open]);
  return (
    <div className="app-shell">
      <div className="desktop-sidebar">
        <Sidebar />
      </div>
      <dialog
        ref={menu}
        className="mobile-menu"
        aria-label="Меню навигации"
        onCancel={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <Sidebar mobile onClose={() => setOpen(false)} />
      </dialog>
      <div className="app-main">
        <header className="mobile-header">
          <button
            className="icon-button"
            onClick={() => setOpen(true)}
            aria-label="Открыть меню"
            aria-expanded={open}
          >
            <Menu size={23} />
          </button>
          <Brand compact />
          <Link
            href="/settings"
            className="profile-avatar"
            aria-label="Профиль"
          >
            А
          </Link>
        </header>
        <main
          id="main-content"
          className={pathname === "/dashboard" ? "" : "secondary-page"}
        >
          {children}
        </main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Быстрая навигация">
        {[
          { href: "/dashboard", label: "Главная", icon: Home },
          { href: "/solutions", label: "Решения", icon: Layers2 },
          { href: "/leads", label: "Заявки", icon: Inbox },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={
                pathname === item.href || pathname.startsWith(`${item.href}/`)
                  ? "page"
                  : undefined
              }
            >
              <Icon size={22} strokeWidth={1.7} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button onClick={() => setOpen(true)} aria-expanded={open}>
          <Ellipsis size={24} />
          <span>Ещё</span>
        </button>
      </nav>
    </div>
  );
}
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <BusinessProvider>
      <a href="#main-content" className="skip-link">
        К содержимому
      </a>
      <AppShellInner>{children}</AppShellInner>
    </BusinessProvider>
  );
}
