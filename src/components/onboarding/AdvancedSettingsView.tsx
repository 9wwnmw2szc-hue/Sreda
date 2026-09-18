"use client";

import Link from "next/link";
import { AdvancedConfigurator } from "@/components/onboarding/AdvancedConfigurator";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { LoadingPanel } from "@/components/dashboard/LoadingPanel";
import { useCurrentBusiness } from "@/hooks/useCurrentBusiness";
import { isDemoMode } from "@/lib/dataMode";

export function AdvancedSettingsView() {
  const { business, businesses, setBusinessId, isLoading, error } =
    useCurrentBusiness();

  return (
    <div className="setup-page">
      <div className="section-topline">
        <div>
          <Link href="/settings" className="text-link">
            ← Настройки
          </Link>
          <h1 className="text-page-title">Расширенная настройка</h1>
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
          <p>Расширенная настройка доступна в рабочем режиме аккаунта.</p>
        </section>
      ) : (
        <AdvancedConfigurator key={business.id} businessId={business.id} />
      )}
    </div>
  );
}
