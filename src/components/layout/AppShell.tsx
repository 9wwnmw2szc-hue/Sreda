"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { BusinessProvider } from "@/hooks/useBusinessContext";
import { useCurrentBusiness } from "@/hooks/useCurrentBusiness";
import { Sidebar } from "@/components/layout/Sidebar";
import { cn } from "@/lib/cn";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { business } = useCurrentBusiness();
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "sticky top-0 z-30 flex h-16 items-center gap-3 px-4 backdrop-blur-md lg:hidden",
            isDashboard
              ? "border-b border-white/10 bg-[#1c1713]/55 text-white"
              : "border-b border-[var(--border-light)] bg-[var(--surface)]/90",
          )}
        >
          <button
            type="button"
            className={cn(
              "rounded-xl p-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              isDashboard
                ? "text-white/90 hover:bg-white/10"
                : "text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]",
            )}
            onClick={() => setSidebarOpen(true)}
            aria-label="Открыть меню"
            aria-controls="app-sidebar"
            aria-expanded={sidebarOpen}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-sm font-semibold",
                isDashboard ? "text-white" : "text-[var(--text-primary)]",
              )}
            >
              {business?.name ?? "Среда"}
            </p>
            <p
              className={cn(
                "text-xs",
                isDashboard ? "text-white/55" : "text-[var(--text-muted)]",
              )}
            >
              {business?.planName
                ? `Тариф: ${business.planName}`
                : "Ваш бизнес"}
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div
            className={cn(
              "w-full",
              isDashboard
                ? "max-w-none"
                : "mx-auto max-w-[1440px] px-4 py-6 md:px-8 md:py-8",
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <BusinessProvider>
      <AppShellInner>{children}</AppShellInner>
    </BusinessProvider>
  );
}
