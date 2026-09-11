"use client";

import { getFirstName, getGreeting } from "@/lib/format";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { SearchField } from "@/components/dashboard/SearchField";
import type { Business, User } from "@/types";

interface DashboardHeaderProps {
  user: User | null;
  businesses: Business[];
  currentBusiness: Business | null;
  onSelectBusiness: (businessId: string) => void;
}

export function DashboardHeader({
  user,
  businesses,
  currentBusiness,
  onSelectBusiness,
}: DashboardHeaderProps) {
  const firstName = user ? getFirstName(user.name) : "друг";
  const greeting = getGreeting();

  return (
    <header className="relative z-20 flex flex-col gap-5 md:gap-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="dashboard-greeting text-[1.875rem] leading-[1.1] font-bold tracking-tight text-white sm:text-[2rem] md:text-[2.125rem] xl:text-[2.5rem]">
            <span className="whitespace-nowrap">
              {greeting}, {firstName}! ☀️
            </span>
          </h1>
          <p className="dashboard-subtitle mt-2 max-w-xl text-[14px] leading-[1.5] text-white/88 sm:text-[15px] md:text-[16px]">
            Ваши боты работают и помогают бизнесу.
            <br className="hidden sm:block" />
            Всё, что нужно — под рукой.
          </p>

          <div className="dashboard-search-desktop mt-[22px] hidden max-w-[380px] md:block">
            <SearchField />
          </div>
        </div>

        <div className="hidden shrink-0 md:block">
          <BusinessSwitcher
            businesses={businesses}
            currentBusiness={currentBusiness}
            onSelect={onSelectBusiness}
          />
        </div>
      </div>

      <div className="flex w-full flex-col gap-3 md:hidden">
        <BusinessSwitcher
          businesses={businesses}
          currentBusiness={currentBusiness}
          onSelect={onSelectBusiness}
        />
        <SearchField />
      </div>
    </header>
  );
}
