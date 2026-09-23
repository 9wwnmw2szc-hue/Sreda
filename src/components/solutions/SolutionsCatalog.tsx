"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/apiClient";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { useCurrentBusiness } from "@/hooks/useCurrentBusiness";
import { isDemoMode } from "@/lib/dataMode";
import {
  recommendationSummary,
  recommendedSolutionCodes,
} from "@/lib/businessTypeRecommendations";
import {
  formatSolutionPrice,
  productSolutionByCode,
  productSolutionCta,
  productSolutionHref,
} from "@/lib/productSolutions";
import {
  solutionRoute,
  solutionVisualCode,
} from "@/config/solutionPresentation";
import { SolutionIcon } from "@/components/solutions/SolutionIcon";
import { getBusinessSolutions } from "@/services/solutions.service";
import type { BusinessSolution, Solution, SolutionStatus } from "@/types";

type Profile = { business_type?: "store" | "service" | "hybrid" };

export function SolutionsCatalog({ solutions }: { solutions: Solution[] }) {
  const router = useRouter();
  const { business, businesses, setBusinessId } = useCurrentBusiness();
  const [notice, setNotice] = useState("");
  const [busyCode, setBusyCode] = useState("");
  const [installed, setInstalled] = useState<BusinessSolution[]>([]);
  const [profileHint, setProfileHint] = useState<{
    id: string;
    type: NonNullable<Profile["business_type"]>;
  } | null>(null);

  async function reloadStatuses(businessId: string) {
    try {
      setInstalled(await getBusinessSolutions(businessId));
    } catch {
      setInstalled([]);
    }
  }

  async function activate(
    code: string,
    body: { enabled?: boolean; status?: "paused" },
    successNotice: string,
    href?: string,
  ) {
    if (!business || busyCode) return;
    setBusyCode(code);
    setNotice("");
    try {
      await apiRequest(`/api/v1/businesses/${business.id}/solutions`, {
        method: "POST",
        body: JSON.stringify({ code, ...body }),
      });
      await reloadStatuses(business.id);
      setNotice(successNotice);
      if (href) router.push(href);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось обновить решение.");
    } finally {
      setBusyCode("");
    }
  }

  useEffect(() => {
    if (!business || isDemoMode) return;
    const businessId = business.id;
    let active = true;
    void Promise.all([
      apiRequest<Profile>(
        `/api/v1/businesses/${encodeURIComponent(businessId)}/profile`,
      ),
      getBusinessSolutions(businessId),
    ])
      .then(([profile, rows]) => {
        if (!active) return;
        setProfileHint({
          id: businessId,
          type: profile.business_type ?? "hybrid",
        });
        setInstalled(rows);
      })
      .catch(() => {
        if (active) {
          setProfileHint(null);
          setInstalled([]);
        }
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
  const statusBySolutionId = new Map(
    installed.map((item) => [item.solutionId, item]),
  );
  const orderedSolutions = [...solutions].sort((a, b) => {
    const ar = recommended.includes(a.code) ? 0 : 1;
    const br = recommended.includes(b.code) ? 0 : 1;
    return ar - br;
  });

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
          <h1>Что поручим Сотам?</h1>
          <p>
            Выберите задачу. Соты помогут с заявками, заказами, записью,
            сообщениями и публикациями.
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
          💡 {hint} Это подсказка — любые решения можно подключить вручную.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="solution-catalog-grid">
        {orderedSolutions.map((solution) => {
          const row = statusBySolutionId.get(solution.id);
          const status: SolutionStatus = row?.status ?? "available";
          const entitlement = row?.entitlementStatus;
          const def = productSolutionByCode(solution.code);
          const cta = productSolutionCta(
            status,
            solution.code,
            entitlement,
          );
          const href = productSolutionHref(status, solution.code);
          const priceLabel = formatSolutionPrice(
            solution.price,
            def?.messageLimit,
          );
          const reconnect =
            status === "available" && entitlement === "disabled";
          const resume = entitlement === "paused" || status === "paused";
          const connectPrimary =
            (status === "available" && !isDemoMode) || reconnect || resume;
          const canPause =
            !isDemoMode &&
            (status === "active" || status === "setup_required") &&
            entitlement !== "paused";
          const canDisable =
            !isDemoMode &&
            (status === "active" ||
              status === "setup_required" ||
              entitlement === "paused");
          return (
            <article
              key={solution.id}
              className={`catalog-card catalog-card--${solutionVisualCode(solution.code)}`}
            >
              <div className="catalog-card__art">
                <SolutionIcon solution={solution.code} variant="hero" />
              </div>
              <div className="catalog-card__body">
                <h2>{solution.name}</h2>
                <p>{solution.description}</p>
                <p className="catalog-card__status" role="status">
                  {row?.note ??
                    (status === "available"
                      ? "Не подключено"
                      : cta)}
                </p>
                <div className="catalog-card__price">
                  <strong>{priceLabel}</strong>
                  {solution.price > 0 && <span>за решение</span>}
                </div>
                {connectPrimary ? (
                  <button
                    className="button button--primary"
                    disabled={busyCode === solution.code}
                    onClick={() =>
                      void activate(
                        solution.code,
                        { enabled: true },
                        reconnect
                          ? "Решение подключено снова."
                          : resume
                            ? "Решение возобновлено."
                            : "Решение подключено. Переходим к настройке.",
                        reconnect || resume
                          ? productSolutionHref("setup_required", solution.code)
                          : href,
                      )
                    }
                  >
                    {busyCode === solution.code
                      ? "Сохраняем…"
                      : reconnect
                        ? "Подключить снова"
                        : resume
                          ? "Возобновить"
                          : "Подключить"}
                    <ArrowRight size={18} />
                  </button>
                ) : (
                  <Link href={href} className="button button--primary">
                    {isDemoMode && status === "available"
                      ? "Посмотреть"
                      : cta}
                    <ArrowRight size={18} />
                  </Link>
                )}
                {canPause || canDisable ? (
                  <div className="catalog-card__lifecycle">
                    {canPause ? (
                      <button
                        type="button"
                        className="button button--outline button--sm"
                        disabled={busyCode === solution.code}
                        onClick={() =>
                          void activate(
                            solution.code,
                            { status: "paused" },
                            "Решение приостановлено.",
                          )
                        }
                      >
                        Приостановить
                      </button>
                    ) : null}
                    {entitlement === "paused" && !resume ? (
                      <button
                        type="button"
                        className="button button--outline button--sm"
                        disabled={busyCode === solution.code}
                        onClick={() =>
                          void activate(
                            solution.code,
                            { enabled: true },
                            "Решение возобновлено.",
                          )
                        }
                      >
                        Возобновить
                      </button>
                    ) : null}
                    {canDisable ? (
                      <button
                        type="button"
                        className="button button--ghost button--sm"
                        disabled={busyCode === solution.code}
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Отключить решение? Данные сохранятся.",
                            )
                          )
                            return;
                          void activate(
                            solution.code,
                            { enabled: false },
                            "Решение отключено.",
                          );
                        }}
                      >
                        Отключить
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {status !== "available" && (
                  <Link className="text-link" href={solutionRoute(solution.code)}>
                    Открыть раздел
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <section className="catalog-explanation panel">
        <h2>Один бизнес. Несколько площадок.</h2>
        <p>
          Telegram и ВКонтакте работают с общими клиентами. Управление — в одном
          рабочем пространстве Соты.
        </p>
      </section>
    </div>
  );
}
