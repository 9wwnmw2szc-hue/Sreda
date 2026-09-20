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
} from "@/components/admin/StatusBadge";
import { formatDateTime, formatNumber } from "@/components/admin/format";

type Diagnostics = {
  connectionId: string;
  platform: "telegram" | "vk";
  status: string;
  displayName: string | null;
  externalAccountId: string | null;
  businessPublicId: string;
  businessName: string;
  createdAt: string;
  updatedAt: string;
  secretConfigured: string;
  secretKeyVersion: number | null;
  secretUpdatedAt: string | null;
  runtime: {
    status: string;
    generation: number;
    updatedAt: string;
    serverId?: string | null;
    confirmationConfigured?: string;
  } | null;
  outboxByState: Record<string, number>;
  recentErrors: {
    id: string;
    deliveryState: string;
    attempts: number;
    lastError: string | null;
    availableAt: string | null;
    createdAt: string;
  }[];
};

export default function AdminIntegrationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const me = useAdminMe();
  const canRetry = hasPermission(me, "admin.support.manage");

  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryId, setRetryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminGet<Diagnostics>(`/api/admin/integrations/${id}`);
      setData(res);
    } catch (e) {
      setData(null);
      setError(
        e instanceof AdminApiError
          ? e.message
          : "Не удалось загрузить диагностику",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retry(reason: string) {
    if (!data || !retryId) return;
    setBusy(true);
    setActionError("");
    try {
      await adminPost(`/api/admin/integrations/${id}`, {
        action: "retry_outbox",
        platform: data.platform,
        outboxId: retryId,
        reason,
      });
      setRetryId(null);
      await load();
    } catch (e) {
      setActionError(
        e instanceof AdminApiError ? e.message : "Не удалось повторить",
      );
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
        {error || "Подключение не найдено"}
      </div>
    );
  }

  return (
    <div>
      <p className="admin-page-desc" style={{ marginBottom: 8 }}>
        <Link href="/admin/integrations">← Интеграции</Link>
      </p>
      <h1 className="admin-page-title">
        {data.platform} · {data.businessName}
      </h1>
      <p className="admin-page-desc">
        <Link href={`/admin/businesses/${data.businessPublicId}`}>
          {data.businessPublicId}
        </Link>{" "}
        <StatusBadge status={connectionStatusBadge(data.status)} />
      </p>

      {actionError ? (
        <p className="admin-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="admin-panel">
        <h2 className="admin-panel__title">Подключение</h2>
        <dl className="admin-detail-grid">
          <div className="admin-detail-item">
            <dt>Display name</dt>
            <dd>{data.displayName || "—"}</dd>
          </div>
          <div className="admin-detail-item">
            <dt>External id</dt>
            <dd>{data.externalAccountId || "—"}</dd>
          </div>
          <div className="admin-detail-item">
            <dt>Секрет</dt>
            <dd>{data.secretConfigured}</dd>
          </div>
          <div className="admin-detail-item">
            <dt>Key version</dt>
            <dd>{data.secretKeyVersion ?? "—"}</dd>
          </div>
          <div className="admin-detail-item">
            <dt>Обновлён</dt>
            <dd>{formatDateTime(data.updatedAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="admin-panel">
        <h2 className="admin-panel__title">Runtime</h2>
        {!data.runtime ? (
          <div className="admin-state">Runtime не найден</div>
        ) : (
          <dl className="admin-detail-grid">
            <div className="admin-detail-item">
              <dt>Статус</dt>
              <dd>{data.runtime.status}</dd>
            </div>
            <div className="admin-detail-item">
              <dt>Generation</dt>
              <dd>{data.runtime.generation}</dd>
            </div>
            <div className="admin-detail-item">
              <dt>Обновлён</dt>
              <dd>{formatDateTime(data.runtime.updatedAt)}</dd>
            </div>
            {data.runtime.confirmationConfigured ? (
              <div className="admin-detail-item">
                <dt>Confirmation</dt>
                <dd>{data.runtime.confirmationConfigured}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </div>

      <div className="admin-panel">
        <h2 className="admin-panel__title">Outbox по состояниям</h2>
        <div className="admin-panel__grid">
          {Object.keys(data.outboxByState).length === 0 ? (
            <div className="admin-state">Нет сообщений</div>
          ) : (
            Object.entries(data.outboxByState).map(([state, count]) => (
              <div className="admin-stat-row" key={state}>
                <span>{state}</span>
                <span>{formatNumber(count)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="admin-panel">
        <h2 className="admin-panel__title">Недавние ошибки outbox</h2>
        {data.recentErrors.length === 0 ? (
          <div className="admin-state">Ошибок нет</div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {data.recentErrors.map((e) => (
              <li
                key={e.id}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border-subtle)",
                  fontSize: "0.8125rem",
                }}
              >
                <div>
                  <strong>{e.deliveryState}</strong> · attempts {e.attempts} ·{" "}
                  {formatDateTime(e.createdAt)}
                </div>
                <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>
                  {e.lastError || "—"}
                </div>
                {canRetry ? (
                  <button
                    type="button"
                    className="button button--outline button--sm"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      setActionError("");
                      setRetryId(e.id);
                    }}
                  >
                    Повторить доставку
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AdminConfirmDialog
        open={retryId != null}
        title="Повторить доставку outbox?"
        description="Сообщение будет возвращено в очередь. Укажите причину."
        requireReason
        busy={busy}
        error={actionError}
        confirmLabel="Повторить"
        onCancel={() => setRetryId(null)}
        onConfirm={(reason) => void retry(reason)}
      />
    </div>
  );
}
