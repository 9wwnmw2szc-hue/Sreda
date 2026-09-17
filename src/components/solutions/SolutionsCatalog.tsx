"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { useCurrentBusiness } from "@/hooks/useCurrentBusiness";
import { isDemoMode } from "@/lib/dataMode";
import {
  recommendationSummary,
  recommendedSolutionCodes,
} from "@/lib/businessTypeRecommendations";
import {
  solutionRoute,
  solutionVisualCode,
} from "@/config/solutionPresentation";
import type { Solution } from "@/types";

type Profile = { business_type?: "store" | "service" | "hybrid" };

export function SolutionsCatalog({ solutions }: { solutions: Solution[] }) {
  const { business, businesses, setBusinessId } = useCurrentBusiness();
  const [notice, setNotice] = useState("");
  const [profileHint, setProfileHint] = useState<{
    id: string;
    type: NonNullable<Profile["business_type"]>;
  } | null>(null);
  async function activate(code: string) {
    if (!business) return;
    try {
      await apiRequest(`/api/v1/businesses/${business.id}/solutions`, {
        method: "POST",
        body: JSON.stringify({ code, enabled: true }),
      });
      setNotice("Решение подключено. Откройте раздел и завершите настройку.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось подключить.");
    }
  }
  useEffect(() => {
    if (!business || isDemoMode) return;
    const businessId = business.id;
    let active = true;
    void apiRequest<Profile>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/profile`,
    )
      .then((profile) => {
        if (active)
          setProfileHint({
            id: businessId,
            type: profile.business_type ?? "hybrid",
          });
      })
      .catch(() => {
        if (active) setProfileHint(null);
      });
    return () => {
      active = false;
    };
  }, [business]);
  const businessType =
    !isDemoMode && business && profileHint?.id === business.id
      ? profileHint.type
      : null;
  const recommended = recommendedSolutionCodes(businessType);
  const hint = recommendationSummary(businessType);
  return (
    <div className="solutions-page">
      <div className="section-topline">
        <span className="eyebrow">Инструменты для вашего бизнеса</span>
        <BusinessSwitcher
          businesses={businesses}
          currentBusiness={business}
          onSelect={setBusinessId}
        />
      </div>
      <header className="solutions-intro">
        <div>
          <h1>Что поручим Среде?</h1>
          <p>
            Выберите задачу. Среда поможет с заявками, публикациями, продажами и
            записью.
          </p>
        </div>
        <span className="solutions-intro__symbol">
          <Sparkles size={32} />
        </span>
      </header>
      <p className="prototype-banner">
        {isDemoMode
          ? "Демонстрация решений для Telegram и ВКонтакте."
          : "Решения работают с едиными клиентами, сотрудниками и подключениями Telegram/VK."}
      </p>
      {hint && (
        <p className="account-notice" role="status">
          {hint} Это подсказка — любые решения можно подключить вручную.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="solution-catalog-grid">
        {solutions.map((solution) => {
          const isRecommended = recommended.includes(solution.code);
          return (
            <article
              key={solution.id}
              className={`catalog-card catalog-card--${solutionVisualCode(solution.code)}${isRecommended ? " is-recommended" : ""}`}
            >
              <div className="catalog-card__art">
                <Image
                  src={`/assets/sreda/v2/module-${solutionVisualCode(solution.code)}.webp`}
                  alt=""
                  width={200}
                  height={200}
                  sizes="160px"
                />
              </div>
              <div className="catalog-card__body">
                <h2>
                  {solution.name}
                  {isRecommended && (
                    <span className="recommend-badge">Рекомендуем</span>
                  )}
                </h2>
                <p>{solution.description}</p>
                <div className="catalog-card__price">
                  <strong>{solution.price} ₽</strong>
                  <span>/ месяц за решение</span>
                </div>
                {solution.code === "leads" ? (
                  <Link
                    href="/solutions/leads/setup"
                    className="button button--primary"
                  >
                    {isDemoMode ? "Посмотреть настройку" : "Настроить"}
                    <ArrowRight size={18} />
                  </Link>
                ) : (
                  <>
                    <button
                      className="button button--primary"
                      onClick={() => void activate(solution.code)}
                    >
                      Подключить
                    </button>
                    <Link
                      className="text-link"
                      href={solutionRoute(solution.code)}
                    >
                      Настроить
                    </Link>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <section className="catalog-explanation panel">
        <h2>Один бизнес. Несколько площадок.</h2>
        <p>
          Telegram и ВКонтакте будут работать с общими заявками. Управление — в
          одном рабочем пространстве Среды.
        </p>
      </section>
    </div>
  );
}
