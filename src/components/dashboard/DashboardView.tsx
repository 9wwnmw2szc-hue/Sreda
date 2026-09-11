"use client";

import { Suspense } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { SolutionWorkspace } from "@/components/dashboard/SolutionWorkspace";
import { TariffCard } from "@/components/dashboard/TariffCard";
import { ConnectionsCard } from "@/components/dashboard/ConnectionsCard";
import { PromoCard } from "@/components/dashboard/PromoCard";
import { RecentLeads } from "@/components/dashboard/RecentLeads";
import { ScheduledPosts } from "@/components/dashboard/ScheduledPosts";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { BrandBlock } from "@/components/dashboard/BrandBlock";
import { useDashboardData } from "@/hooks/useDashboardData";

function RightColumn({
  billing,
  activeSolutionsCount,
  connections,
}: {
  billing: ReturnType<typeof useDashboardData>["billing"];
  activeSolutionsCount: number;
  connections: ReturnType<typeof useDashboardData>["connections"];
}) {
  return (
    <>
      <TariffCard billing={billing} activeSolutionsCount={activeSolutionsCount} />
      <ConnectionsCard connections={connections} />
      <PromoCard />
    </>
  );
}

export function DashboardView() {
  const {
    user,
    business,
    businesses,
    setBusinessId,
    workspaceItems,
    connections,
    billing,
    leads,
    posts,
    activeSolutionsCount,
    isLoading,
  } = useDashboardData();

  const rightProps = {
    billing,
    activeSolutionsCount,
    connections,
  };

  return (
    <div className="dashboard-root">
      <section className="dashboard-hero">
        <div className="dashboard-hero__atmosphere" aria-hidden />
        <div className="dashboard-hero__content relative z-10 flex flex-col gap-6 px-4 pt-5 pb-6 md:gap-6 md:px-5 md:pt-6 md:pb-7 min-[1360px]:px-6 min-[1360px]:pt-7 min-[1360px]:pb-8">
          {/*
            ≥1360: right 280 / gap 24
            1100–1359: right 248 / gap 20
            Center column is minmax(0,1fr) — platform width follows it.
          */}
          <div className="dashboard-hero-grid mx-auto grid w-full max-w-[1440px] items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_248px] min-[1100px]:gap-5 min-[1360px]:grid-cols-[minmax(0,1fr)_280px] min-[1360px]:gap-6">
            <div className="flex min-w-0 flex-col gap-6">
              <DashboardHeader
                user={user}
                businesses={businesses}
                currentBusiness={business}
                onSelectBusiness={setBusinessId}
              />

              {isLoading && workspaceItems.length === 0 ? (
                <div className="flex min-h-[320px] items-center justify-center rounded-[20px] border border-white/10 bg-white/5 text-sm text-white/60 backdrop-blur-sm">
                  Загружаем рабочее пространство…
                </div>
              ) : (
                <Suspense fallback={null}>
                  <SolutionWorkspace items={workspaceItems} />
                </Suspense>
              )}

              {/* Tablet 768–1099: tariff / connections under the scene */}
              <aside className="dashboard-right-panel hidden flex-col gap-4 md:flex min-[1100px]:hidden">
                <RightColumn {...rightProps} />
              </aside>
            </div>

            {/* Desktop ≥1100: sticky right column */}
            <aside className="dashboard-right-panel mt-2 hidden flex-col gap-4 min-[1100px]:flex min-[1100px]:mt-0 min-[1100px]:sticky min-[1100px]:top-6">
              <RightColumn {...rightProps} />
            </aside>
          </div>
        </div>
      </section>

      <section className="dashboard-lower bg-[var(--background)] px-4 py-8 md:px-5 md:py-10 min-[1360px]:px-6">
        <div className="mx-auto grid max-w-[1440px] gap-5 min-[1100px]:grid-cols-2 min-[1100px]:gap-6">
          <RecentLeads leads={leads} />
          <ScheduledPosts posts={posts} />
        </div>

        {/* Mobile <768: tariff after requests / posts */}
        <aside className="dashboard-right-panel mx-auto mt-6 flex max-w-[1440px] flex-col gap-4 md:hidden">
          <RightColumn {...rightProps} />
        </aside>

        <div className="mx-auto mt-6 grid max-w-[1440px] gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <QuickActions />
          <BrandBlock />
        </div>
      </section>
    </div>
  );
}
