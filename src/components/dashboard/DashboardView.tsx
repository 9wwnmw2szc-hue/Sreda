"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import { DashboardKpis } from "./DashboardKpis";
import { SolutionCards } from "./SolutionCards";
import { TodaySchedule } from "./TodaySchedule";
import { RecentLeads } from "./RecentLeads";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { LoadingPanel } from "./LoadingPanel";
import { DetailDialog } from "./DetailDialog";
import { SolutionModule, solutionState } from "./SolutionModule";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import {
  useDashboardData,
  type WorkspaceSolutionItem,
} from "@/hooks/useDashboardData";
import { formatRelativeDateTime } from "@/lib/format";
import { isDemoMode } from "@/lib/dataMode";
import { apiRequest } from "@/lib/apiClient";
import {
  recommendationSummary,
  recommendedSolutionCodes,
} from "@/lib/businessTypeRecommendations";
import { solutionRoute } from "@/config/solutionPresentation";
import {
  formatSolutionPrice,
  productSolutionByCode,
  productSolutionCta,
  productSolutionHref,
} from "@/lib/productSolutions";
import type { Lead, Post } from "@/types";
import { APP_NAME } from "@/config/brand";

type Selection =
  | { type: "catalog" }
  | { type: "solution"; item: WorkspaceSolutionItem }
  | { type: "lead"; item: Lead }
  | { type: "post"; item: Post };

export function DashboardView() {
  const data = useDashboardData();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectionBusiness, setSelectionBusiness] = useState("");
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState("");
  const [profileHint, setProfileHint] = useState<{
    id: string;
    type: "store" | "service" | "hybrid";
  } | null>(null);
  const [industryHint, setIndustryHint] = useState<{
    id: string;
    industry: string | null;
    onboardingDone: boolean;
    progress: Record<string, boolean>;
  } | null>(null);

  useEffect(() => {
    if (!data.businessId || isDemoMode || data.isLoading) return;
    const businessId = data.businessId;
    let active = true;
    void apiRequest<{ business_type?: "store" | "service" | "hybrid" }>(
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
  }, [data.businessId, data.isLoading]);

  useEffect(() => {
    if (!data.businessId || isDemoMode || data.isLoading) return;
    const businessId = data.businessId;
    let active = true;
    void apiRequest<{
      industry?: string | null;
      onboarding_completed_at?: string | null;
      setup_progress?: Record<string, boolean>;
    }>(`/api/v1/businesses/${encodeURIComponent(businessId)}/industry`)
      .then((row) => {
        if (active)
          setIndustryHint({
            id: businessId,
            industry: row.industry ?? null,
            onboardingDone: !!row.onboarding_completed_at,
            progress: row.setup_progress ?? {},
          });
      })
      .catch(() => {
        if (active) setIndustryHint(null);
      });
    return () => {
      active = false;
    };
  }, [data.businessId, data.isLoading]);

  const businessType =
    !isDemoMode && profileHint?.id === data.businessId
      ? profileHint.type
      : null;
  const recommended = recommendedSolutionCodes(businessType);
  const recommendHint = recommendationSummary(businessType);
  const showIndustryNudge =
    !isDemoMode &&
    industryHint?.id === data.businessId &&
    !industryHint.industry &&
    !industryHint.onboardingDone;
  const setupPct = (() => {
    if (!industryHint || industryHint.id !== data.businessId) return null;
    if (industryHint.onboardingDone) return null;
    const p = industryHint.progress;
    const keys = Object.keys(p);
    if (!keys.length) return industryHint.industry ? 20 : 0;
    const done = keys.filter((k) => p[k]).length;
    return Math.min(100, Math.round((done / Math.max(keys.length, 4)) * 100));
  })();
  const nextSetupHint = (() => {
    if (!industryHint?.industry || industryHint.onboardingDone) return null;
    if (
      !industryHint.progress.schedule &&
      ["beauty", "education", "rental", "sport_health", "automotive"].includes(
        industryHint.industry,
      )
    )
      return "Настройте расписание, чтобы открыть онлайн-запись.";
    if (!industryHint.progress.telegram)
      return "Подключите Telegram, чтобы клиенты могли писать боту.";
    if (
      !industryHint.progress.catalog &&
      ["retail", "food"].includes(industryHint.industry)
    )
      return "Заполните каталог товаров.";
    return "Продолжите настройку бизнеса.";
  })();

  const show = (value: Selection) => {
    setQuery("");
    setSelectionBusiness(data.businessId);
    setSelection(value);
  };
  const selectSolution = (item: WorkspaceSolutionItem) =>
    show({ type: "solution", item });
  const catalog = () => show({ type: "catalog" });

  async function connectSolution(code: string) {
    if (!data.businessId || isDemoMode || activating) return;
    setActivating(true);
    setActivateError("");
    try {
      await apiRequest(`/api/v1/businesses/${data.businessId}/solutions`, {
        method: "POST",
        body: JSON.stringify({ code, enabled: true }),
      });
      setSelection(null);
      data.retry();
      router.push(productSolutionHref("setup_required", code));
    } catch (e) {
      setActivateError(
        e instanceof Error ? e.message : "Не удалось подключить решение.",
      );
    } finally {
      setActivating(false);
    }
  }

  const term = query.trim().toLocaleLowerCase("ru-RU");
  const matchingSolutions = term
    ? data.workspaceItems.filter((item) =>
        `${item.solution.name} ${item.solution.description}`
          .toLocaleLowerCase("ru-RU")
          .includes(term),
      )
    : [];
  const matchingLeads = term
    ? data.leads.filter((item) =>
        `${item.name} ${item.message ?? ""}`
          .toLocaleLowerCase("ru-RU")
          .includes(term),
      )
    : [];
  const matchingPosts = term
    ? data.posts.filter((item) =>
        item.text.toLocaleLowerCase("ru-RU").includes(term),
      )
    : [];
  const resultCount =
    matchingSolutions.length + matchingLeads.length + matchingPosts.length;
  const selectedLead =
    selection?.type === "lead"
      ? data.leads.find((lead) => lead.id === selection.item.id)
      : undefined;
  const visibleSelection: Selection | null =
    selectionBusiness !== data.businessId || data.error || data.isLoading
      ? null
      : selection?.type === "lead"
        ? selectedLead
          ? { type: "lead", item: selectedLead }
          : null
        : selection;
  const dialogTitle =
    visibleSelection?.type === "catalog"
      ? `Что поручим Сотам?`
      : visibleSelection?.type === "solution"
        ? visibleSelection.item.solution.name
        : visibleSelection?.type === "lead"
          ? "Заявка клиента"
          : "Предпросмотр публикации";

  return (
    <div className="dashboard-root soty-dashboard">
      <div className="mobile-business-switcher">
        <BusinessSwitcher
          businesses={data.businesses}
          currentBusiness={data.business}
          onSelect={(id) => {
            setQuery("");
            setSelection(null);
            data.setBusinessId(id);
          }}
        />
      </div>

      {term && !data.isLoading && !data.error ? (
        <section
          className="search-results panel"
          aria-label="Результаты поиска"
          aria-live="polite"
        >
          <div className="panel-heading">
            <h2>Результаты поиска</h2>
            <span>{resultCount}</span>
          </div>
          {!resultCount && (
            <p className="empty-copy">
              Ничего не найдено в текущем рабочем пространстве.
            </p>
          )}
          {matchingSolutions.map((item) => (
            <button
              key={item.solution.id}
              onClick={() => {
                selectSolution(item);
                setQuery("");
              }}
            >
              <Search size={17} />
              <span>
                {item.solution.name}
                <small>Решение</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
          {matchingLeads.map((item) => (
            <button key={item.id} onClick={() => show({ type: "lead", item })}>
              <Search size={17} />
              <span>
                {item.name}
                <small>{item.message}</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
          {matchingPosts.map((item) => (
            <button key={item.id} onClick={() => show({ type: "post", item })}>
              <Search size={17} />
              <span>
                {item.text}
                <small>Публикация</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </section>
      ) : null}

      {data.error ? (
        <section role="alert" className="panel load-error">
          <h1>Не получилось загрузить данные</h1>
          <p>{data.error}</p>
          <button
            className="button button--primary"
            onClick={() => {
              if (!data.business || !data.user) window.location.reload();
              else data.retry();
            }}
          >
            <RefreshCw size={18} />
            Попробовать ещё раз
          </button>
        </section>
      ) : (
        <>
          <header className="soty-hero">
            <div>
              <h1>Ваш бизнес — в порядке</h1>
              <p>Все инструменты в одном месте</p>
            </div>
          </header>

          {showIndustryNudge ? (
            <p className="account-notice" role="status">
              Помогите {APP_NAME} лучше настроиться под ваш бизнес.{" "}
              <Link href="/onboarding">Выбрать направление</Link>
              {" · "}
              <Link href="/settings/advanced">Расширенная настройка</Link>
            </p>
          ) : null}
          {setupPct != null && setupPct < 100 && !showIndustryNudge ? (
            <p className="account-notice" role="status">
              Настройка бизнеса — {setupPct}%.
              {nextSetupHint ? ` ${nextSetupHint}` : ""}{" "}
              <Link href="/onboarding">Продолжить</Link>
            </p>
          ) : null}
          {recommendHint ? (
            <p className="account-notice" role="status">
              {recommendHint}
            </p>
          ) : null}

          {data.isLoading ? (
            <LoadingPanel label="Готовим рабочее пространство" />
          ) : (
            <>
              {data.businessId ? (
                <DashboardKpis businessId={data.businessId} />
              ) : null}
              <SolutionCards items={data.workspaceItems} />
              <div className="soty-panels">
                <RecentLeads
                  leads={data.leads}
                  onSelect={(item) => show({ type: "lead", item })}
                  onRefresh={() => data.retry()}
                />
                {data.businessId ? (
                  <TodaySchedule businessId={data.businessId} />
                ) : null}
              </div>
              <div className="soty-dashboard__actions">
                <button
                  type="button"
                  className="button button--outline button--full"
                  onClick={catalog}
                >
                  Все решения
                </button>
              </div>
            </>
          )}
        </>
      )}

      {visibleSelection && (
        <DetailDialog title={dialogTitle} onClose={() => setSelection(null)}>
          {visibleSelection.type === "catalog" && (
            <>
              <p className="dialog-intro">
                Готовые инструменты для ваших ежедневных задач. Выберите то, что
                нужно вашему бизнесу.
              </p>
              {recommendHint && (
                <p className="account-notice" role="status">
                  {recommendHint} Подсказка, не ограничение.
                </p>
              )}
              <div className="catalog-grid">
                {data.workspaceItems.map((item) => (
                  <SolutionModule
                    key={item.solution.id}
                    item={item}
                    onSelect={selectSolution}
                    recommended={recommended.includes(item.code)}
                  />
                ))}
              </div>
            </>
          )}
          {visibleSelection.type === "solution" && (
            <>
              <div
                className={`solution-detail solution-detail--${visibleSelection.item.code}`}
              >
                <Image
                  src={visibleSelection.item.visual.assetSrc}
                  alt=""
                  width={1024}
                  height={1024}
                  sizes="180px"
                  unoptimized
                />
                <span
                  className={`solution-state tone-${solutionState(visibleSelection.item).tone}`}
                >
                  <i />
                  {solutionState(visibleSelection.item).label}
                </span>
              </div>
              <p className="dialog-intro">
                {visibleSelection.item.solution.description}
              </p>
              <div className="detail-facts">
                <span>Стоимость</span>
                <strong>
                  {formatSolutionPrice(
                    visibleSelection.item.solution.price,
                    productSolutionByCode(visibleSelection.item.code)
                      ?.messageLimit,
                  )}
                </strong>
              </div>
              {visibleSelection.item.note && (
                <p className="account-notice">{visibleSelection.item.note}</p>
              )}
              {activateError && (
                <p role="alert" className="account-error">
                  {activateError}
                </p>
              )}
              {visibleSelection.item.status === "available" && !isDemoMode ? (
                <button
                  type="button"
                  className="button button--primary button--full"
                  disabled={activating}
                  onClick={() =>
                    void connectSolution(visibleSelection.item.code)
                  }
                >
                  {activating ? "Подключаем…" : "Подключить"}
                  <ArrowUpRight size={18} />
                </button>
              ) : (
                <Link
                  className="button button--primary button--full"
                  href={productSolutionHref(
                    visibleSelection.item.status,
                    visibleSelection.item.code,
                  )}
                >
                  {productSolutionCta(
                    visibleSelection.item.status,
                    visibleSelection.item.code,
                  )}
                  <ArrowUpRight size={18} />
                </Link>
              )}
              {visibleSelection.item.status !== "available" && (
                <Link
                  className="button button--outline button--full"
                  href={solutionRoute(visibleSelection.item.code)}
                >
                  Открыть раздел
                  <ArrowUpRight size={18} />
                </Link>
              )}
            </>
          )}
          {visibleSelection.type === "lead" && (
            <>
              <div className="detail-facts">
                <span>Клиент</span>
                <strong>{visibleSelection.item.name}</strong>
              </div>
              <div className="detail-facts">
                <span>Площадка</span>
                <PlatformBadge platform={visibleSelection.item.source} />
              </div>
              <p className="message-preview">
                {visibleSelection.item.message ||
                  "Клиент не оставил сообщение."}
              </p>
              <p className="demo-note">
                {formatRelativeDateTime(visibleSelection.item.createdAt)}
              </p>
              <Link
                href="/leads"
                className="button button--outline button--full"
              >
                Все заявки
                <ArrowUpRight size={18} />
              </Link>
            </>
          )}
          {visibleSelection.type === "post" && (
            <>
              <h3 className="post-detail-title">{visibleSelection.item.text}</h3>
              <div className="detail-facts">
                <span>
                  {visibleSelection.item.publishAt
                    ? formatRelativeDateTime(visibleSelection.item.publishAt)
                    : "Дата не выбрана"}
                </span>
                <span className="post-row__platforms">
                  {visibleSelection.item.platforms.map((platform) => (
                    <PlatformBadge key={platform} platform={platform} compact />
                  ))}
                </span>
              </div>
            </>
          )}
        </DetailDialog>
      )}
    </div>
  );
}
