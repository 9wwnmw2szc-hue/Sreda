"use client";
import { Suspense, use, useMemo, useState, useTransition } from "react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { apiRequest, ClientError } from "@/lib/apiClient";
import { AnalyticsChart } from "./AnalyticsChart";
import type { ChartSpec } from "@/server/analytics/charts";
import type { PeriodPreset } from "@/server/analytics/periods";

type Kpi = {
  id: string;
  label: string;
  display: string;
  delta: { absolute: number; percent: number | null };
  kind: string;
};

type Overview = {
  period: { preset: string; label: string; previousLabel: string; timezone: string };
  kpis: Kpi[];
  insights: { fact: string; kind: string }[];
  charts: ChartSpec[];
  sections: Record<string, unknown>;
};

type FileRow = {
  id: string;
  original_filename: string;
  size_bytes: number;
  file_type: string;
  status: string;
  row_count: number | null;
  sheet_count: number | null;
  created_at: string;
  error_message: string | null;
};

const SECTIONS = [
  { id: "overview", label: "Обзор" },
  { id: "orders", label: "Продажи" },
  { id: "leads", label: "Заявки" },
  { id: "bookings", label: "Записи" },
  { id: "clients", label: "Клиенты" },
  { id: "communications", label: "Коммуникации" },
  { id: "posts", label: "Контент" },
  { id: "files", label: "Таблицы" },
  { id: "reports", label: "Отчёты" },
  { id: "ai", label: "AI-аналитик" },
] as const;

const PERIODS: { id: PeriodPreset; label: string }[] = [
  { id: "today", label: "Сегодня" },
  { id: "7d", label: "7 дней" },
  { id: "30d", label: "30 дней" },
  { id: "this_month", label: "Этот месяц" },
  { id: "last_month", label: "Прошлый месяц" },
];

const overviewCache = new Map<string, Promise<Overview>>();
const filesCache = new Map<string, Promise<FileRow[]>>();

function overviewPromise(businessId: string, period: PeriodPreset) {
  const key = `${businessId}:${period}`;
  let p = overviewCache.get(key);
  if (!p) {
    p = apiRequest<Overview>(
      `/api/v1/businesses/${businessId}/analytics?period=${period}`,
    );
    overviewCache.set(key, p);
  }
  return p;
}

function filesPromise(businessId: string, bust = 0) {
  const key = `${businessId}:${bust}`;
  let p = filesCache.get(key);
  if (!p) {
    p = apiRequest<FileRow[]>(
      `/api/v1/businesses/${businessId}/analytics/files`,
    );
    filesCache.set(key, p);
  }
  return p;
}

function deltaText(d: Kpi["delta"]) {
  if (d.percent === null)
    return d.absolute === 0 ? "без изменений" : "нет базы для %";
  const sign = d.percent > 0 ? "+" : "";
  return `${sign}${d.percent}% к пред. периоду`;
}

export function AnalyticsView() {
  const { currentBusiness } = useBusinessContext();
  if (!currentBusiness) return <p>Выберите бизнес.</p>;
  return (
    <Suspense fallback={<p className="text-body-sm">Загрузка аналитики…</p>}>
      <AnalyticsInner key={currentBusiness.id} businessId={currentBusiness.id} />
    </Suspense>
  );
}

function AnalyticsInner({ businessId }: { businessId: string }) {
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("overview");
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [filesBust, setFilesBust] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{
    columns: string[];
    rows: { index: number; cells: unknown[] }[];
    total: number;
    page: number;
    sheetName: string;
  } | null>(null);
  const [aiSource, setAiSource] = useState<"sreda" | "file">("sreda");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResult, setAiResult] = useState<{
    facts: string[];
    interpretations: string[];
    attention: string[];
    questions: string[];
    clarify: string | null;
    chart: ChartSpec | null;
    disclaimer: string;
  } | null>(null);

  const data = use(overviewPromise(businessId, period));
  const files = use(filesPromise(businessId, filesBust));

  const orders = data.sections.orders as {
    topProducts?: { name: string; sold: number; revenue: number; currency: string }[];
    averageCheckDisplay?: string | null;
    averageCheckByCurrency?: { currency: string; amount: number; display: string }[];
  };
  const leads = data.sections.leads as { byStatus?: Record<string, number> };
  const bookings = data.sections.bookings as {
    topServices?: { name: string; count: number }[];
    averageDurationMinutes?: number | null;
    upcoming?: number;
  };
  const clients = data.sections.clients as {
    total?: number;
    identities?: Record<string, number>;
  };
  const posts = data.sections.posts as { byStatus?: Record<string, number> };
  const communications = data.sections.communications as {
    messages?: number;
    platforms?: Record<string, number>;
    open?: number;
  };

  async function onUpload(file: File) {
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/businesses/${businessId}/analytics/files`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name),
          },
          body: file,
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok)
        throw new ClientError(
          res.status,
          body?.error?.code ?? "UPLOAD_FAILED",
          body?.error?.message ?? "Не удалось загрузить файл.",
        );
      filesCache.clear();
      startTransition(() => setFilesBust((n) => n + 1));
      setSelectedFile(body?.file?.id ?? null);
    } catch (e) {
      setError(e instanceof ClientError ? e.message : "Ошибка загрузки.");
    }
  }

  async function openFile(id: string) {
    setSelectedFile(id);
    try {
      const res = await apiRequest<{
        columns: string[];
        rows: { index: number; cells: unknown[] }[];
        total: number;
        page: number;
        sheetName: string;
      }>(`/api/v1/businesses/${businessId}/analytics/files/${id}/rows`);
      setViewer(res);
      setSection("files");
    } catch (e) {
      setError(e instanceof ClientError ? e.message : "Не удалось открыть таблицу.");
    }
  }

  async function deleteFile(id: string, name: string) {
    if (
      !confirm(
        `Удалить «${name}»?\n\nФайл и результаты анализа будут удалены.`,
      )
    )
      return;
    await apiRequest(`/api/v1/businesses/${businessId}/analytics/files/${id}`, {
      method: "DELETE",
    });
    if (selectedFile === id) {
      setSelectedFile(null);
      setViewer(null);
    }
    filesCache.clear();
    startTransition(() => setFilesBust((n) => n + 1));
  }

  async function runExport(entity: string, format: "csv" | "xlsx") {
    try {
      const res = await fetch(
        `/api/v1/businesses/${businessId}/analytics/export`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity, format, period }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ClientError(
          res.status,
          body?.error?.code ?? "EXPORT_FAILED",
          body?.error?.message ?? "Не удалось сформировать отчёт.",
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entity}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ClientError ? e.message : "Ошибка экспорта.");
    }
  }

  async function askAi(full = false, question = aiQuestion) {
    setError(null);
    try {
      const res = await apiRequest<{
        facts: string[];
        interpretations: string[];
        attention: string[];
        questions: string[];
        clarify: string | null;
        chart: ChartSpec | null;
        disclaimer: string;
      }>(`/api/v1/businesses/${businessId}/analytics/ai`, {
        method: "POST",
        body: JSON.stringify({
          question,
          source: aiSource,
          fileId: aiSource === "file" ? selectedFile : undefined,
          period,
          full,
        }),
      });
      setAiResult(res);
    } catch (e) {
      setError(e instanceof ClientError ? e.message : "AI недоступен.");
    }
  }

  const periodButtons = useMemo(
    () =>
      PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={"analytics-chip" + (period === p.id ? " is-selected" : "")}
          onClick={() => startTransition(() => setPeriod(p.id))}
        >
          {p.label}
        </button>
      )),
    [period],
  );

  return (
    <div className="analytics-page">
      <header className="analytics-page__header">
        <div>
          <p className="eyebrow">Аналитика</p>
          <h1 className="text-page-title">Как идут дела</h1>
          <p className="text-body-sm">
            Показатели только по реальным данным вашего бизнеса.
          </p>
        </div>
      </header>

      <nav className="analytics-nav" aria-label="Разделы аналитики">
        <select
          className="analytics-nav__select"
          value={section}
          onChange={(e) =>
            setSection(e.target.value as (typeof SECTIONS)[number]["id"])
          }
        >
          {SECTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="analytics-nav__chips" role="tablist">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={section === s.id}
              className={
                "analytics-chip" + (section === s.id ? " is-selected" : "")
              }
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      {section !== "files" && section !== "ai" && section !== "reports" ? (
        <div className="analytics-periods" role="group" aria-label="Период">
          {periodButtons}
        </div>
      ) : null}

      {error ? <p className="analytics-error">{error}</p> : null}
      {pending ? <p className="text-caption">Обновляем…</p> : null}

      {section === "overview" ? (
        <div className="stack-lg">
          <p className="text-caption">
            {data.period.label} · сравнение с {data.period.previousLabel}
          </p>
          {data.kpis.length === 0 ? (
            <div className="analytics-empty">
              <p className="text-body">
                Пока недостаточно данных. Когда появятся заказы, заявки или
                записи, здесь появятся ключевые показатели.
              </p>
            </div>
          ) : (
            <div className="analytics-kpi-grid">
              {data.kpis.map((kpi) => (
                <article key={kpi.id} className="analytics-kpi">
                  <p className="text-label">{kpi.label}</p>
                  <p className="analytics-kpi__value">{kpi.display}</p>
                  <p className="text-caption">{deltaText(kpi.delta)}</p>
                </article>
              ))}
            </div>
          )}
          {data.insights.length ? (
            <section className="stack-sm">
              <h2 className="text-section-title">Что изменилось</h2>
              <ul className="analytics-insights">
                {data.insights.map((item, i) => (
                  <li key={i}>
                    <span className="status-chip status-chip--new">Факт</span>
                    {item.fact}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="analytics-charts">
            {data.charts.map((c) => (
              <AnalyticsChart key={c.id} chart={c} />
            ))}
          </div>
          <div className="message-actions">
            <button
              type="button"
              className="button button--outline"
              onClick={() => {
                setAiSource("sreda");
                setSection("ai");
              }}
            >
              AI-анализ периода
            </button>
          </div>
        </div>
      ) : null}

      {section === "orders" ? (
        <div className="stack-lg">
          <h2 className="text-section-title">Продажи</h2>
          {orders?.averageCheckByCurrency?.length ? (
            <p className="text-body">
              Средний чек:{" "}
              {orders.averageCheckByCurrency.map((x) => x.display).join(" · ")}
            </p>
          ) : orders?.averageCheckDisplay ? (
            <p className="text-body">Средний чек: {orders.averageCheckDisplay}</p>
          ) : null}
          <div className="analytics-charts">
            {data.charts
              .filter((c) => c.id.includes("order") || c.id.includes("revenue"))
              .map((c) => (
                <AnalyticsChart key={c.id} chart={c} />
              ))}
          </div>
          {orders?.topProducts?.length ? (
            <section className="stack-sm">
              <h3 className="text-card-title">Топ товаров</h3>
              <ul className="analytics-table-list">
                {orders.topProducts.map((p) => (
                  <li key={p.name + ":" + p.currency}>
                    <strong>{p.name}</strong>
                    <span>
                      {p.sold} шт · {p.revenue} {p.currency}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-body-sm">Нет продаж за период.</p>
          )}
        </div>
      ) : null}

      {section === "leads" ? (
        <div className="stack-lg">
          <h2 className="text-section-title">Заявки</h2>
          <AnalyticsChart
            chart={
              data.charts.find((c) => c.id === "leads_trend") ?? {
                id: "leads_trend",
                kind: "line",
                title: "Динамика заявок",
                categories: [],
                series: [],
                emptyMessage: "Пока недостаточно данных для графика заявок.",
              }
            }
          />
          {leads?.byStatus ? (
            <ul className="analytics-table-list">
              {Object.entries(leads.byStatus).map(([k, v]) => (
                <li key={k}>
                  <strong>{k}</strong>
                  <span>{v}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {section === "bookings" ? (
        <div className="stack-lg">
          <h2 className="text-section-title">Записи</h2>
          {typeof bookings?.upcoming === "number" ? (
            <p className="text-body-sm">Предстоящие: {bookings.upcoming}</p>
          ) : null}
          {typeof bookings?.averageDurationMinutes === "number" ? (
            <p className="text-body-sm">
              Средняя длительность: {bookings.averageDurationMinutes} мин
            </p>
          ) : null}
          <div className="analytics-charts">
            {data.charts
              .filter((c) => c.id.includes("booking"))
              .map((c) => (
                <AnalyticsChart key={c.id} chart={c} />
              ))}
          </div>
          {bookings?.topServices?.length ? (
            <section className="stack-sm">
              <h3 className="text-card-title">Популярные услуги</h3>
              <ul className="analytics-table-list">
                {bookings.topServices.map((s) => (
                  <li key={s.name}>
                    <strong>{s.name}</strong>
                    <span>{s.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {section === "clients" ? (
        <div className="stack-lg">
          <h2 className="text-section-title">Клиенты</h2>
          <p className="text-body">Всего в базе: {clients?.total ?? 0}</p>
          {clients?.identities ? (
            <ul className="analytics-table-list">
              {Object.entries(clients.identities).map(([k, v]) => (
                <li key={k}>
                  <strong>{k}</strong>
                  <span>{v}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {section === "communications" ? (
        <div className="stack-lg">
          <h2 className="text-section-title">Коммуникации</h2>
          <p className="text-body">
            Сообщений за период: {communications?.messages ?? 0}
          </p>
          <p className="text-body-sm">
            Открытых диалогов: {communications?.open ?? 0}
          </p>
        </div>
      ) : null}

      {section === "posts" ? (
        <div className="stack-lg">
          <h2 className="text-section-title">Контент</h2>
          {posts?.byStatus ? (
            <ul className="analytics-table-list">
              <li>
                <strong>Черновики</strong>
                <span>{posts.byStatus.draft ?? 0}</span>
              </li>
              <li>
                <strong>Запланировано</strong>
                <span>{posts.byStatus.scheduled ?? 0}</span>
              </li>
              <li>
                <strong>Опубликовано</strong>
                <span>{posts.byStatus.published ?? 0}</span>
              </li>
              <li>
                <strong>Ошибки</strong>
                <span>{posts.byStatus.failed ?? 0}</span>
              </li>
            </ul>
          ) : (
            <p className="text-body-sm">Нет публикаций за период.</p>
          )}
        </div>
      ) : null}

      {section === "files" ? (
        <div className="stack-lg">
          <div className="analytics-files-head">
            <h2 className="text-section-title">Ваши таблицы</h2>
            <label className="button button--primary">
              Загрузить таблицу
              <input
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {!files.length ? (
            <div className="analytics-empty">
              <p className="text-body">У вас пока нет таблиц.</p>
            </div>
          ) : (
            <ul className="analytics-file-list">
              {files.map((f) => (
                <li key={f.id} className="analytics-file-card">
                  <div className="card-layout">
                    <strong className="card-layout__title">
                      {f.original_filename}
                    </strong>
                    <p className="text-caption">
                      Загружено:{" "}
                      {new Date(f.created_at).toLocaleDateString("ru-RU")} ·{" "}
                      {(f.size_bytes / 1024).toFixed(1)} КБ
                      {f.row_count != null ? ` · ${f.row_count} строк` : ""}
                      {f.sheet_count != null ? ` · ${f.sheet_count} лист.` : ""}
                    </p>
                    <p className="text-caption">
                      Статус:{" "}
                      <span className="status-chip status-chip--processing">
                        {f.status === "ready"
                          ? "Готово"
                          : f.status === "failed"
                            ? "Ошибка"
                            : "Обработка"}
                      </span>
                    </p>
                    {f.error_message ? (
                      <p className="analytics-error">{f.error_message}</p>
                    ) : null}
                    <div className="message-actions">
                      <button
                        type="button"
                        className="button button--outline"
                        disabled={f.status !== "ready"}
                        onClick={() => void openFile(f.id)}
                      >
                        Открыть
                      </button>
                      <button
                        type="button"
                        className="button button--outline"
                        disabled={f.status !== "ready"}
                        onClick={() => {
                          setSelectedFile(f.id);
                          setAiSource("file");
                          setSection("ai");
                        }}
                      >
                        Анализировать
                      </button>
                      <a
                        className="button button--outline"
                        href={`/api/v1/businesses/${businessId}/analytics/files/${f.id}/download`}
                      >
                        Скачать
                      </a>
                      <button
                        type="button"
                        className="button button--outline"
                        onClick={() => void deleteFile(f.id, f.original_filename)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {viewer ? (
            <section className="stack-sm analytics-viewer">
              <h3 className="text-card-title">Лист: {viewer.sheetName}</h3>
              <p className="text-caption">Строк: {viewer.total}</p>
              <div className="analytics-viewer__scroll">
                <table>
                  <thead>
                    <tr>
                      {viewer.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {viewer.rows.map((r) => (
                      <tr key={r.index}>
                        {r.cells.map((cell, i) => (
                          <td key={i}>{cell == null ? "" : String(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="analytics-viewer__cards">
                {viewer.rows.map((r) => (
                  <article key={r.index} className="analytics-row-card">
                    {viewer.columns.map((c, i) => (
                      <p key={c}>
                        <span className="text-caption">{c}</span>
                        <strong>
                          {r.cells[i] == null ? "—" : String(r.cells[i])}
                        </strong>
                      </p>
                    ))}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {section === "reports" ? (
        <div className="stack-lg">
          <h2 className="text-section-title">Отчёты</h2>
          <p className="text-body-sm">
            Скачайте данные «БизнеСоты» за выбранный период ({period}).
          </p>
          <div className="analytics-export-grid">
            {(
              [
                ["orders", "Заказы"],
                ["leads", "Заявки"],
                ["bookings", "Записи"],
                ["clients", "Клиенты"],
                ["products", "Товары"],
              ] as const
            ).map(([id, label]) => (
              <div key={id} className="analytics-export-card">
                <strong>{label}</strong>
                <div className="message-actions">
                  <button
                    type="button"
                    className="button button--outline"
                    onClick={() => void runExport(id, "csv")}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => void runExport(id, "xlsx")}
                  >
                    Excel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {section === "ai" ? (
        <div className="stack-lg">
          <h2 className="text-section-title">AI-аналитик</h2>
          <fieldset className="analytics-ai-source">
            <legend className="text-label">Источник</legend>
            <label>
              <input
                type="radio"
                checked={aiSource === "sreda"}
                onChange={() => setAiSource("sreda")}
              />
              Данные БизнеСоты
            </label>
            <label>
              <input
                type="radio"
                checked={aiSource === "file"}
                onChange={() => setAiSource("file")}
              />
              Моя таблица
            </label>
          </fieldset>
          {aiSource === "file" ? (
            files.length ? (
              <label className="stack-sm">
                <span className="text-label">Таблица</span>
                <select
                  value={selectedFile ?? ""}
                  onChange={(e) => setSelectedFile(e.target.value || null)}
                >
                  <option value="">Выберите файл</option>
                  {files
                    .filter((f) => f.status === "ready")
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.original_filename}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <p className="text-body-sm">
                Загрузите Excel/CSV или выберите данные БизнеСоты, которые хотите
                проанализировать.
              </p>
            )
          ) : null}
          <div className="message-actions">
            <button
              type="button"
              className="button button--primary"
              disabled={aiSource === "file" && !selectedFile}
              onClick={() => void askAi(true)}
            >
              Провести полный анализ
            </button>
            <button
              type="button"
              className="button button--outline"
              disabled={aiSource === "file" && !selectedFile}
              onClick={() => {
                setAiQuestion("Покажи динамику");
                void askAi(false, "Покажи динамику");
              }}
            >
              Показать динамику
            </button>
            <button
              type="button"
              className="button button--outline"
              disabled={aiSource === "file" && !selectedFile}
              onClick={() => {
                setAiQuestion("Найди необычные значения");
                void askAi(false, "Найди необычные значения");
              }}
            >
              Найти проблемы
            </button>
          </div>
          <label className="stack-sm">
            <span className="text-label">Спросите что-нибудь о данных…</span>
            <textarea
              rows={3}
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              placeholder="Например: какие товары дали больше всего денег?"
            />
          </label>
          <button
            type="button"
            className="button button--primary"
            disabled={
              !aiQuestion.trim() || (aiSource === "file" && !selectedFile)
            }
            onClick={() => void askAi(false)}
          >
            Спросить
          </button>
          {aiResult ? (
            <section className="stack-md analytics-ai-result">
              {aiResult.clarify ? (
                <p className="text-body">{aiResult.clarify}</p>
              ) : null}
              {aiResult.facts.length ? (
                <div className="stack-sm">
                  <h3 className="text-card-title">Факты</h3>
                  <ul>
                    {aiResult.facts.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {aiResult.interpretations.length ? (
                <div className="stack-sm">
                  <h3 className="text-card-title">Интерпретации</h3>
                  <ul>
                    {aiResult.interpretations.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {aiResult.attention.length ? (
                <div className="stack-sm">
                  <h3 className="text-card-title">На что обратить внимание</h3>
                  <ul>
                    {aiResult.attention.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {aiResult.chart ? <AnalyticsChart chart={aiResult.chart} /> : null}
              <p className="text-caption">{aiResult.disclaimer}</p>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
