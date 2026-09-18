"use client";
import { useEffect, useRef, useState } from "react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { DetailDialog } from "@/components/dashboard/DetailDialog";
import { LoadingPanel } from "@/components/dashboard/LoadingPanel";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { getLeadPage, updateLeadStatus } from "@/services/leads.service";
import { isDemoMode } from "@/lib/dataMode";
import { formatRelativeDateTime } from "@/lib/format";
import { ClientError } from "@/lib/apiClient";
import { LeadFormFieldsPanel } from "@/components/leads/LeadFormFieldsPanel";
import { EmptyStateCta } from "@/components/solutions/SolutionSetupBanner";
import type { Lead, LeadStatus } from "@/types";
const labels: Record<LeadStatus, string> = {
  new: "Новая",
  processing: "В работе",
  waiting_customer: "Ждём клиента",
  completed: "Завершена",
  rejected: "Отклонена",
  closed: "Закрыта",
};
export function LeadsView() {
  const {
    businesses,
    currentBusiness,
    setCurrentBusinessId,
    isLoading,
    error,
    refreshBusinesses,
  } = useBusinessContext();
  return (
    <div className="leads-page">
      <header className="leads-page__heading">
        <div>
          <span className="eyebrow">Обращения клиентов</span>
          <h1>Заявки</h1>
          <p>Все обращения вашего бизнеса в одном месте.</p>
        </div>
        <BusinessSwitcher
          businesses={businesses}
          currentBusiness={currentBusiness}
          onSelect={setCurrentBusinessId}
        />
      </header>
      {error ? (
        <section className="panel">
          <p className="account-error" role="alert">
            {error}
          </p>
          <button
            className="button button--outline"
            onClick={() => void refreshBusinesses().catch(() => undefined)}
          >
            Обновить доступ
          </button>
        </section>
      ) : isLoading ? (
        <LoadingPanel label="Загружаем бизнес" />
      ) : currentBusiness ? (
        <>
          <LeadList
            key={`${currentBusiness.id}:${currentBusiness.role}`}
            businessId={currentBusiness.id}
          />
          {!isDemoMode && (
            <LeadFormFieldsPanel
              key={`fields:${currentBusiness.id}:${currentBusiness.role}`}
              businessId={currentBusiness.id}
              canEdit={
                currentBusiness.role === "owner" ||
                currentBusiness.role === "admin"
              }
            />
          )}
        </>
      ) : (
        <p>Выберите бизнес.</p>
      )}
    </div>
  );
}
function LeadList({ businessId }: { businessId: string }) {
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [search, setSearch] = useState(""),
    [source, setSource] = useState(""),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState("");
  const [attempt, setAttempt] = useState(0);
  const key = `${filter}:${attempt}:${search}:${source}:${from}:${until}`;
  const [page, setPage] = useState<{
    key: string;
    rows: Lead[];
    cursor?: string;
    more: boolean;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<LeadStatus>("new");
  const [busy, setBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);
  useEffect(() => {
    const version = ++sequence.current;
    void getLeadPage(
      businessId,
      filter === "all" ? undefined : filter,
      undefined,
      { search, source, from, until },
    )
      .then((rows) => {
        if (sequence.current !== version) return;
        const last = rows.at(-1);
        setPage({
          key,
          rows,
          cursor: last ? `${last.createdAt}|${last.id}` : undefined,
          more: rows.length === 100,
        });
        setFailure(null);
      })
      .catch((e: unknown) => {
        if (sequence.current === version)
          setFailure({
            key,
            message:
              e instanceof Error ? e.message : "Не удалось загрузить заявки.",
          });
      });
    return () => {
      sequence.current = version + 1;
    };
  }, [businessId, filter, key, search, source, from, until]);
  const error = failure?.key === key ? failure.message : null;
  const current = page?.key === key && !error ? page : null;
  const item = current?.rows.find((row) => row.id === selected);
  function refresh() {
    setSelected(null);
    setNotice("");
    setActionError("");
    setMoreBusy(false);
    setAttempt((value) => value + 1);
  }
  async function more() {
    if (!current || moreBusy) return;
    const version = sequence.current;
    setMoreBusy(true);
    setActionError("");
    try {
      const rows = await getLeadPage(
        businessId,
        filter === "all" ? undefined : filter,
        current.cursor,
        { search, source, from, until },
      );
      if (version !== sequence.current) return;
      const last = rows.at(-1);
      setPage({
        key,
        rows: [
          ...current.rows,
          ...rows.filter(
            (row) => !current.rows.some((old) => old.id === row.id),
          ),
        ],
        cursor: last ? `${last.createdAt}|${last.id}` : current.cursor,
        more: rows.length === 100,
      });
    } catch (e) {
      if (version === sequence.current)
        setFailure({
          key,
          message:
            e instanceof Error ? e.message : "Не удалось загрузить заявки.",
        });
    } finally {
      if (version === sequence.current) setMoreBusy(false);
    }
  }
  async function save() {
    if (!item || busy || moreBusy) return;
    const version = sequence.current;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const updated = await updateLeadStatus(businessId, item.id, status);
      if (version !== sequence.current) return;
      setPage((old) =>
        old?.key === key
          ? {
              ...old,
              rows: old.rows
                .map((row) => (row.id === updated.id ? updated : row))
                .filter((row) => filter === "all" || row.status === filter),
            }
          : old,
      );
      setSelected(null);
      setNotice("Статус заявки сохранён.");
    } catch (e) {
      if (version !== sequence.current) return;
      if (e instanceof ClientError && [401, 403, 404].includes(e.status)) {
        setSelected(null);
        setFailure({ key, message: e.message });
      } else
        setActionError(
          e instanceof Error
            ? e.message
            : "Не удалось сохранить статус. Попробуйте ещё раз.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel leads-toolbar">
        <label>
          Поиск
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Имя или телефон"
          />
        </label>
        <label>
          Источник
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Все</option>
            <option value="telegram">Telegram</option>
            <option value="vk">VK</option>
          </select>
        </label>
        <label>
          С даты
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          До даты
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
          <span className="field-hint">Не включая выбранный день</span>
        </label>
        <label htmlFor="lead-filter">
          Статус
          <select
            id="lead-filter"
            value={filter}
            disabled={busy || moreBusy}
            onChange={(e) => {
              setSelected(null);
              setNotice("");
              setActionError("");
              setFilter(e.target.value as LeadStatus | "all");
            }}
          >
            <option value="all">Все заявки</option>
            <option value="new">Новые</option>
            <option value="processing">В работе</option>
            <option value="waiting_customer">Ждём клиента</option>
            <option value="completed">Завершённые</option>
            <option value="rejected">Отклонённые</option>
            <option value="closed">Закрытые</option>
          </select>
        </label>
        <button
          className="button button--outline"
          disabled={busy || moreBusy}
          onClick={refresh}
        >
          Обновить
        </button>
      </section>
      {isDemoMode && (
        <p className="account-footnote">
          Демонстрационные данные. Изменение статуса доступно в рабочем
          аккаунте.
        </p>
      )}
      {notice && (
        <p className="account-notice" role="status">
          {notice}
        </p>
      )}
      {error ? (
        <section className="panel">
          <p className="account-error" role="alert">
            {error}
          </p>
          <button className="button button--outline" onClick={refresh}>
            Попробовать ещё раз
          </button>
        </section>
      ) : !current ? (
        <LoadingPanel label="Загружаем заявки" />
      ) : (
        <section className="panel">
          <p className="account-footnote">
            Загружено заявок: {current.rows.length}
          </p>
          {current.rows.length ? (
            <ul className="leads-records">
              {current.rows.map((row) => (
                <li key={row.id}>
                  <button
                    className="leads-record"
                    disabled={busy}
                    onClick={() => {
                      setSelected(row.id);
                      setStatus(row.status);
                      setActionError("");
                    }}
                  >
                    <span className="leads-record__content">
                      <strong>{row.name}</strong>
                      <span>{row.phone}</span>
                      {row.processingName && (
                        <small>В работе · {row.processingName}</small>
                      )}
                      <span>{row.message || "Без сообщения"}</span>
                    </span>
                    <span className="leads-record__meta">
                      <PlatformBadge platform={row.source} />
                      <span
                        className={`status-chip status-chip--${row.status}`}
                      >
                        {labels[row.status]}
                      </span>
                      <time dateTime={row.createdAt}>
                        {formatRelativeDateTime(row.createdAt)}
                      </time>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              {filter === "all" ? (
                <EmptyStateCta
                  title="Заявок пока нет"
                  description="Настройте форму заявки и подключите Telegram или VK — обращения появятся здесь."
                  href="/solutions/leads/setup"
                  action="Настроить приём заявок"
                />
              ) : (
                <p>Заявок с таким статусом пока нет.</p>
              )}
            </div>
          )}
          {current.more && (
            <button
              className="button button--outline"
              disabled={moreBusy || busy}
              onClick={() => void more()}
            >
              {moreBusy ? "Загружаем…" : "Показать ещё"}
            </button>
          )}
        </section>
      )}
      {item && (
        <DetailDialog title="Заявка клиента" onClose={() => setSelected(null)}>
          <div className="detail-facts">
            <span>Клиент</span>
            <strong>{item.name}</strong>
          </div>
          <div className="detail-facts">
            <span>Площадка</span>
            <PlatformBadge platform={item.source} />
          </div>
          {item.phone && (
            <div className="detail-facts">
              <span>Телефон</span>
              <strong>{item.phone}</strong>
            </div>
          )}
          {item.processingName && <p>Ответственный: {item.processingName}</p>}
          {item.answers &&
            Object.entries(item.answers).map(([key, value]) => (
              <div className="detail-facts" key={key}>
                <span>
                  {(
                    {
                      name: "Имя",
                      phone: "Телефон",
                      email: "Email",
                      service: "Услуга",
                      message: "Сообщение",
                      comment: "Комментарий",
                    } as Record<string, string>
                  )[key] ?? key}
                </span>
                <strong>{value || "—"}</strong>
              </div>
            ))}
          <p className="message-preview">
            {item.message || "Клиент не оставил сообщение."}
          </p>
          <p className="account-footnote">
            {formatRelativeDateTime(item.createdAt)}
          </p>
          <form
            className="account-card"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={busy || moreBusy || isDemoMode}>
              <label htmlFor="lead-status">Статус заявки</label>
              <select
                id="lead-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as LeadStatus)}
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                className="button button--primary"
                disabled={status === item.status}
                type="submit"
              >
                {busy ? "Сохраняем…" : "Сохранить статус"}
              </button>
            </fieldset>
          </form>
          {actionError && (
            <p className="account-error" role="alert">
              {actionError}
            </p>
          )}
        </DetailDialog>
      )}
    </>
  );
}
