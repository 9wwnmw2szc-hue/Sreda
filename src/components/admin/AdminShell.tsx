"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { LogOut, Menu, Shield, X } from "lucide-react";
import type { AdminNavItem } from "@/config/adminNav";
import { clearClientAuthState } from "@/components/account/SignOutButton";
import { AdminSearch } from "./AdminSearch";
import { adminPost, type AdminMe } from "./admin-api";
import "./admin.css";

const AdminMeContext = createContext<AdminMe | null>(null);

export function useAdminMe(): AdminMe | null {
  return useContext(AdminMeContext);
}

function navActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({
  user,
  nav,
  children,
}: {
  user: AdminMe;
  nav: AdminNavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      await adminPost("/api/auth/sign-out", {});
      clearClientAuthState();
      window.location.replace("/admin/login");
    } catch {
      setSignOutError("Не удалось выйти");
      setSigningOut(false);
    }
  }

  return (
    <AdminMeContext.Provider value={user}>
      <div className="admin-shell">
        <aside
          className={`admin-sidebar${sidebarOpen ? " admin-sidebar--open" : ""}`}
          aria-label="Навигация панели"
        >
          <div className="admin-sidebar__brand">
            <Shield size={18} strokeWidth={1.8} aria-hidden />
            <div>
              <strong>БизнеСоты Admin</strong>
              <span>Панель управления</span>
            </div>
          </div>
          <nav className="admin-sidebar__nav">
            {nav.map((item) => {
              const active = navActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`admin-sidebar__link${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setSidebarOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="admin-sidebar__footer">
            <div className="admin-sidebar__user">
              <strong>{user.name}</strong>
              <span>
                @{user.username} · {user.role}
              </span>
            </div>
            <button
              type="button"
              className="admin-sidebar__signout"
              aria-label="Выйти из панели"
              disabled={signingOut}
              onClick={() => void signOut()}
            >
              <LogOut size={16} aria-hidden />
              {signingOut ? "Выход…" : "Выйти"}
            </button>
            {signOutError ? (
              <p className="admin-error" role="alert">
                {signOutError}
              </p>
            ) : null}
          </div>
        </aside>

        {sidebarOpen ? (
          <button
            type="button"
            className="admin-sidebar-backdrop"
            aria-label="Закрыть меню"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <div className="admin-main">
          <header className="admin-header">
            <button
              type="button"
              className="admin-header__menu"
              aria-label={sidebarOpen ? "Закрыть меню" : "Открыть меню"}
              onClick={() => setSidebarOpen((v) => !v)}
            >
              {sidebarOpen ? (
                <X size={18} aria-hidden />
              ) : (
                <Menu size={18} aria-hidden />
              )}
            </button>
            <AdminSearch />
            <div className="admin-header__meta">
              <span className="admin-header__role">{user.role}</span>
            </div>
          </header>
          <main className="admin-content">{children}</main>
        </div>
      </div>
    </AdminMeContext.Provider>
  );
}
