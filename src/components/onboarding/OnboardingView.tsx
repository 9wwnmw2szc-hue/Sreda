"use client";

import { IndustryOnboarding } from "@/components/onboarding/IndustryOnboarding";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { LoadingPanel } from "@/components/dashboard/LoadingPanel";
import { useCurrentBusiness } from "@/hooks/useCurrentBusiness";
import { isDemoMode } from "@/lib/dataMode";

export function OnboardingView() {
  const { business, businesses, setBusinessId, isLoading, error } =
    useCurrentBusiness();

  return (
    <div className="setup-page">
      <div className="section-topline">
        <div>
          <span className="eyebrow">Онбординг</span>
          <h1 className="text-page-title">Настройка бизнеса</h1>
        </div>
        <BusinessSwitcher
          businesses={businesses}
          currentBusiness={business}
          onSelect={setBusinessId}
        />
      </div>
      {isLoading ? (
        <LoadingPanel label="Загружаем ваш бизнес" />
      ) : error || !business ? (
        <section className="panel load-error" role="alert">
          <h1>Не получилось загрузить бизнес</h1>
          <p>{error ?? "Выберите бизнес, чтобы продолжить."}</p>
        </section>
      ) : isDemoMode ? (
        <section className="panel">
          <p>Онбординг доступен в рабочем режиме аккаунта.</p>
        </section>
      ) : (
        <IndustryOnboarding key={business.id} businessId={business.id} />
      )}
    </div>
  );
}
