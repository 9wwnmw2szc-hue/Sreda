"use client";
import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, ArrowUpRight, Search, RefreshCw } from "lucide-react";
import { DashboardHeader } from "./DashboardHeader";
import { SolutionWorkspace } from "./SolutionWorkspace";
import { TariffCard } from "./TariffCard";
import { ConnectionsCard } from "./ConnectionsCard";
import { RecentLeads } from "./RecentLeads";
import { ScheduledPosts } from "./ScheduledPosts";
import { QuickActions } from "./QuickActions";
import { SearchField } from "./SearchField";
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
import type { Lead, Post } from "@/types";
type Selection =
  | { type: "catalog" }
  | { type: "solution"; item: WorkspaceSolutionItem }
  | { type: "lead"; item: Lead }
  | { type: "post"; item: Post };
export function DashboardView() {
  const data = useDashboardData();
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectionBusiness, setSelectionBusiness] = useState("");
  const show = (value: Selection) => {
    setQuery("");
    setSelectionBusiness(data.businessId);
    setSelection(value);
  };
  const selectSolution = (item: WorkspaceSolutionItem) =>
    show({ type: "solution", item });
  const catalog = () => show({ type: "catalog" });
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
  const visibleSelection =
    selectionBusiness === data.businessId ? selection : null;
  const dialogTitle =
    visibleSelection?.type === "catalog"
      ? "Что поручим Среде?"
      : visibleSelection?.type === "solution"
        ? visibleSelection.item.solution.name
        : visibleSelection?.type === "lead"
          ? "Заявка клиента"
          : "Предпросмотр публикации";
  return (
    <div className="dashboard-root">
      <div className="dashboard-topbar">
        <SearchField value={query} onChange={setQuery} />
        <BusinessSwitcher
          businesses={data.businesses}
          currentBusiness={data.business}
          onSelect={(id) => {
            setQuery("");
            setSelection(null);
            data.setBusinessId(id);
          }}
        />
        <Link
          className="profile-avatar desktop-profile"
          href="/settings"
          aria-label="Профиль пользователя"
        >
          {data.user?.name.slice(0, 1) ?? "А"}
        </Link>
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
          <div className="dashboard-hero-grid">
            <div className="dashboard-workspace">
              <DashboardHeader
                user={data.user}
                connections={data.connections}
                loading={data.isLoading}
              />
              {data.isLoading ? (
                <div className="workspace-loading" role="status">
                  <span className="loading-orbit" />
                  Готовим рабочее пространство…
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div className="workspace-loading">Загружаем решения…</div>
                  }
                >
                  <SolutionWorkspace
                    items={data.workspaceItems}
                    onSelect={selectSolution}
                    onCatalog={catalog}
                  />
                </Suspense>
              )}
            </div>
            <aside
              className="dashboard-right-panel"
              aria-label="Подключения и подписка"
            >
              {data.isLoading ? (
                <LoadingPanel label="Загружаем подключения и подписку" />
              ) : (
                <>
                  <ConnectionsCard connections={data.connections} />
                  <TariffCard
                    billing={data.billing}
                    activeSolutionsCount={data.activeSolutionsCount}
                  />
                  <button
                    className="button button--primary button--full"
                    onClick={catalog}
                  >
                    <Plus size={20} />
                    Добавить решение
                  </button>
                </>
              )}
            </aside>
          </div>
          <section
            className="dashboard-operations"
            aria-label="События бизнеса"
          >
            <div className="operations-grid">
              {data.isLoading ? (
                <>
                  <LoadingPanel label="Загружаем заявки" />
                  <LoadingPanel label="Загружаем публикации" />
                </>
              ) : (
                <>
                  <RecentLeads
                    leads={data.leads}
                    onSelect={(item) => show({ type: "lead", item })}
                  />
                  <ScheduledPosts
                    posts={data.posts}
                    onSelect={(item) => show({ type: "post", item })}
                  />
                </>
              )}
            </div>
            {!data.isLoading && <QuickActions onCatalog={catalog} />}
          </section>
          <aside className="mobile-account-panels">
            {data.isLoading ? (
              <LoadingPanel label="Загружаем подключения и подписку" />
            ) : (
              <>
                <ConnectionsCard connections={data.connections} />
                <TariffCard
                  billing={data.billing}
                  activeSolutionsCount={data.activeSolutionsCount}
                />
              </>
            )}
          </aside>
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
              <div className="catalog-grid">
                {data.workspaceItems.map((item) => (
                  <SolutionModule
                    key={item.solution.id}
                    item={item}
                    onSelect={selectSolution}
                  />
                ))}
              </div>
              <p className="demo-note">
                Демонстрация: подключение площадок и оплата пока недоступны.
              </p>
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
                <strong>{visibleSelection.item.solution.price} ₽/мес.</strong>
              </div>
              <p className="demo-note">
                Это демонстрация решения. Реальное подключение появится после
                запуска сервиса.
              </p>
              <Link
                className="button button--primary button--full"
                href={
                  visibleSelection.item.code === "leads"
                    ? "/solutions/leads/setup"
                    : "/solutions"
                }
              >
                {visibleSelection.item.code === "leads"
                  ? "Посмотреть настройку"
                  : "Подробнее о решениях"}
                <ArrowUpRight size={18} />
              </Link>
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
              <p className="message-preview">{visibleSelection.item.message}</p>
              <p className="demo-note">
                {formatRelativeDateTime(visibleSelection.item.createdAt)} ·
                Демонстрационная заявка
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
              <Image
                className="post-detail-photo"
                src={
                  visibleSelection.item.imageUrl ?? "/assets/sreda/v2/cafe.webp"
                }
                width={768}
                height={512}
                alt="Кофе и свежая выпечка"
              />
              <h3 className="post-detail-title">
                {visibleSelection.item.text}
              </h3>
              {visibleSelection.item.excerpt && (
                <p className="dialog-intro">{visibleSelection.item.excerpt}</p>
              )}
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
              <p className="demo-note">
                Демонстрационная публикация. На площадки ничего не отправляется.
              </p>
            </>
          )}
        </DetailDialog>
      )}
    </div>
  );
}
