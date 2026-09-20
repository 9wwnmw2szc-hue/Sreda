"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  adminGet,
  adminPost,
  hasPermission,
} from "@/components/admin/admin-api";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { useAdminMe } from "@/components/admin/AdminShell";
import {
  StatusBadge,
  connectionStatusBadge,
  solutionStatusBadge,
} from "@/components/admin/StatusBadge";
import {
  formatDateTime,
  formatNumber,
  solutionLabel,
} from "@/components/admin/format";

type Channel = {
  status: string | null;
  displayName: string | null;
  externalAccountId: string | null;
  secretConfigured: string;
  runtimeStatus: string | null;
  lastError: string | null;
};

type BusinessDetail = {
  publicId: string;
  name: string;
  industry: string | null;
  industrySubtype: string | null;
  businessModel: string | null;
  setupMode: string | null;
  timezone: string | null;
  createdAt: string;
  archivedAt: string | null;
  archived: boolean;
  suspended: boolean;
  overview: {
    owner: {
      publicId: string;
      name: string;
      username: string;
      email: string | null;
    } | null;
    members: {
      publicId: string;
      name: string;
      username: string;
      role: string;
      status: string;
      createdAt: string;
    }[];
    industry: string | null;
    businessModel: string | null;
    setupMode: string | null;
    solutions: {
      code: string;
      status: string;
      startsAt: string;
      expiresAt: string | null;
    }[];
    telegram: Channel;
    vk: Channel;
    counts: {
      clients: number;
      orders: number;
      leads: number;
      bookings: number;
    };
  };
  subscriptions: {
    code: string;
    status: string;
    startsAt: string;
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  recentAudit: {
    id: string;
    action: string;
    actorType: string;
    actorUsername: string | null;
    createdAt: string;
    details: unknown;
  }[];
  platformSuspensions: {
    reason: string;
    createdAt: string;
    liftedAt: string | null;
  }[];
};

const TABS = [
  "overview",
  "members",
  "solutions",
  "integrations",
  "subscription",
  "activity",
  "errors",
  "audit",
] as const;

type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: "Обзор",
  members: "Сотрудники",
  solutions: "Решения",
  integrations: "Интеграции",
  subscription: "Подписка",
  activity: "Активность",
  errors: "Ошибки",
  audit: "Audit",
};

const SOLUTION_CODES = [
  "orders",
  "leads",
  "booking",
  "admin_messages",
  "autopost",
] as const;

export default function AdminBusinessDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const me = useAdminMe();
  const canManage = hasPermission(me, "admin.businesses.manage");
  const canOverride = hasPermission(me, "admin.subscriptions.manage");

  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<BusinessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<null | "suspend" | "unsuspend" | "override">(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [overrideForm, setOverrideForm] = useState({
    solutionCode: "orders",
    status: "active",
    expiresAt: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await adminGet<BusinessDetail>(`/api/admin/businesses/${id}`);
      setData(res);
      setError("");
    } catch (e) {
      setData(null);
      setError(
        e instanceof AdminApiError ? e.message : "Не удалось загрузить бизнес",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await adminGet<BusinessDetail>(
          `/api/admin/businesses/${id}`,
        );
        if (cancelled) return;
        setData(res);
        setError("");
      } catch (e) {
        if (cancelled) return;
        setData(null);
        setError(
          e instanceof AdminApiError
            ? e.message
            : "Не удалось загрузить бизнес",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function runAction(reason: string) {
    if (!dialog) return;
    setBusy(true);
    setActionError("");
    try {
      if (dialog === "suspend" || dialog === "unsuspend") {
        await adminPost(`/api/admin/businesses/${id}`, {
          action: dialog,
          reason,
        });
      } else if (dialog === "override") {
        await adminPost(`/api/admin/businesses/${id}`, {
          action: "override_solution",
          solutionCode: overrideForm.solutionCode,
          status: overrideForm.status,
          expiresAt: overrideForm.expiresAt
            ? new Date(overrideForm.expiresAt).toISOString()
            : null,
          reason,
        });
      }
      setDialog(null);
      await load();
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 403) {
        setActionError("Недостаточно прав");
        setDialog(null);
      } else {
        setActionError(
          e instanceof AdminApiError ? e.message : "Действие не выполнено",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-state" role="status">
        Загрузка…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="admin-state admin-state--error" role="alert">
        {error || "Бизнес не найден"}
      </div>
    );
  }

  const { overview } = data;

  return (
    <div>
      <p className="admin-page-desc" style={{ marginBottom: 8 }}>
        <Link href="/admin/businesses">← Бизнесы</Link>
      </p>
      <h1 className="admin-page-title">{data.name}</h1>
      <p className="admin-page-desc">
        {data.publicId}{" "}
        {data.suspended ? (
          <StatusBadge status="suspended" />
        ) : data.archived ? (
          <StatusBadge status="disabled" label="Архив" />
        ) : (
          <StatusBadge status="active" />
        )}
      </p>

      {actionError ? (
        <p className="admin-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="admin-tabs" role="tablist" aria-label="Разделы бизнеса">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="admin-panel">
          <dl className="admin-detail-grid">
            <div className="admin-detail-item">
              <dt>Владелец</dt>
              <dd>
                {overview.owner ? (
                  <Link href={`/admin/users/${overview.owner.publicId}`}>
                    {overview.owner.name} (@{overview.owner.username})
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="admin-detail-item">
              <dt>Отрасль</dt>
              <dd>
                {data.industry || "—"}
                {data.industrySubtype ? ` / ${data.industrySubtype}` : ""}
              </dd>
            </div>
            <div className="admin-detail-item">
              <dt>Модель</dt>
              <dd>{data.businessModel || "—"}</dd>
            </div>
            <div className="admin-detail-item">
              <dt>Setup</dt>
              <dd>{data.setupMode || "—"}</dd>
            </div>
            <div className="admin-detail-item">
              <dt>Часовой пояс</dt>
              <dd>{data.timezone || "—"}</dd>
            </div>
            <div className="admin-detail-item">
              <dt>Создан</dt>
              <dd>{formatDateTime(data.createdAt)}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {tab === "members" ? (
        <div className="admin-panel">
          {overview.members.length === 0 ? (
            <div className="admin-state">Нет сотрудников</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.8125rem" }}>
              {overview.members.map((m) => (
                <li key={m.publicId} style={{ marginBottom: 6 }}>
                  <Link href={`/admin/users/${m.publicId}`}>{m.name}</Link>
                  {" · @"}
                  {m.username} · {m.role} · {m.status}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "solutions" || tab === "subscription" ? (
        <div className="admin-panel">
          {data.subscriptions.length === 0 ? (
            <div className="admin-state">Нет решений</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.8125rem" }}>
              {data.subscriptions.map((s) => (
                <li key={s.code} style={{ marginBottom: 8 }}>
                  <strong>{solutionLabel(s.code)}</strong>{" "}
                  <StatusBadge status={solutionStatusBadge(s.status)} />
                  <div style={{ color: "var(--text-muted)" }}>
                    с {formatDateTime(s.startsAt)}
                    {s.expiresAt ? ` до ${formatDateTime(s.expiresAt)}` : " · без срока"}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {canOverride && tab === "subscription" ? (
            <div style={{ marginTop: 16 }}>
              <h3 className="admin-panel__title">Override решения</h3>
              <div className="admin-toolbar">
                <select
                  aria-label="Решение"
                  value={overrideForm.solutionCode}
                  onChange={(e) =>
                    setOverrideForm((f) => ({
                      ...f,
                      solutionCode: e.target.value,
                    }))
                  }
                >
                  {SOLUTION_CODES.map((c) => (
                    <option key={c} value={c}>
                      {solutionLabel(c)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Статус"
                  value={overrideForm.status}
                  onChange={(e) =>
                    setOverrideForm((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  <option value="active">active</option>
                  <option value="trial">trial</option>
                  <option value="expired">expired</option>
                  <option value="disabled">disabled</option>
                </select>
                <input
                  type="datetime-local"
                  aria-label="Истекает"
                  value={overrideForm.expiresAt}
                  onChange={(e) =>
                    setOverrideForm((f) => ({
                      ...f,
                      expiresAt: e.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  className="button button--primary button--sm"
                  onClick={() => {
                    setActionError("");
                    setDialog("override");
                  }}
                >
                  Применить
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "integrations" ? (
        <div className="admin-panel">
          {(["telegram", "vk"] as const).map((platform) => {
            const ch = overview[platform];
            return (
              <div key={platform} style={{ marginBottom: 14 }}>
                <h3 className="admin-panel__title">{platform}</h3>
                <dl className="admin-detail-grid">
                  <div className="admin-detail-item">
                    <dt>Статус</dt>
                    <dd>
                      <StatusBadge status={connectionStatusBadge(ch.status)} />
                    </dd>
                  </div>
                  <div className="admin-detail-item">
                    <dt>Имя</dt>
                    <dd>{ch.displayName || "—"}</dd>
                  </div>
                  <div className="admin-detail-item">
                    <dt>External id</dt>
                    <dd>{ch.externalAccountId || "—"}</dd>
                  </div>
                  <div className="admin-detail-item">
                    <dt>Секрет</dt>
                    <dd>{ch.secretConfigured}</dd>
                  </div>
                  <div className="admin-detail-item">
                    <dt>Runtime</dt>
                    <dd>{ch.runtimeStatus || "—"}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      ) : null}

      {tab === "activity" ? (
        <div className="admin-panel">
          <div className="admin-panel__grid">
            <div className="admin-stat-row">
              <span>Клиенты</span>
              <span>{formatNumber(overview.counts.clients)}</span>
            </div>
            <div className="admin-stat-row">
              <span>Заказы</span>
              <span>{formatNumber(overview.counts.orders)}</span>
            </div>
            <div className="admin-stat-row">
              <span>Заявки</span>
              <span>{formatNumber(overview.counts.leads)}</span>
            </div>
            <div className="admin-stat-row">
              <span>Записи</span>
              <span>{formatNumber(overview.counts.bookings)}</span>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "errors" ? (
        <div className="admin-panel">
          {!overview.telegram.lastError && !overview.vk.lastError ? (
            <div className="admin-state">Ошибок outbox не найдено</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.8125rem" }}>
              {overview.telegram.lastError ? (
                <li>
                  <strong>Telegram:</strong> {overview.telegram.lastError}
                </li>
              ) : null}
              {overview.vk.lastError ? (
                <li>
                  <strong>VK:</strong> {overview.vk.lastError}
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "audit" ? (
        <div className="admin-panel">
          {data.recentAudit.length === 0 ? (
            <div className="admin-state">Записей нет</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.8125rem" }}>
              {data.recentAudit.map((a) => (
                <li key={a.id} style={{ marginBottom: 6 }}>
                  {formatDateTime(a.createdAt)} · {a.action}
                  {a.actorUsername ? ` · @${a.actorUsername}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {canManage ? (
        <div className="admin-danger-zone">
          <h3>Опасная зона</h3>
          <p>Приостановка бизнеса ограничивает работу тенанта.</p>
          {data.suspended ? (
            <button
              type="button"
              className="button button--outline"
              onClick={() => {
                setActionError("");
                setDialog("unsuspend");
              }}
            >
              Снять приостановку
            </button>
          ) : (
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                setActionError("");
                setDialog("suspend");
              }}
            >
              Приостановить бизнес
            </button>
          )}
        </div>
      ) : null}

      <AdminConfirmDialog
        open={dialog === "suspend" || dialog === "unsuspend" || dialog === "override"}
        title={
          dialog === "suspend"
            ? "Приостановить бизнес?"
            : dialog === "unsuspend"
              ? "Снять приостановку бизнеса?"
              : "Применить override решения?"
        }
        description="Действие записывается в аудит. Укажите причину."
        danger={dialog === "suspend"}
        requireReason
        busy={busy}
        error={actionError}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => void runAction(reason)}
      />
    </div>
  );
}
