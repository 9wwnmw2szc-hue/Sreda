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
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/components/admin/format";

type UserDetail = {
  publicId: string;
  name: string;
  username: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
  adminRole: string | null;
  suspended: boolean;
  businesses: {
    publicId: string;
    name: string;
    role: string;
    status: string;
    archived: boolean;
    createdAt: string;
  }[];
  suspensions: {
    reason: string;
    createdAt: string;
    liftedAt: string | null;
  }[];
  recentAudit: {
    id: string;
    action: string;
    createdAt: string;
    reason: string | null;
  }[];
};

const ROLES = ["SUPER_ADMIN", "SUPPORT", "MODERATOR", "FINANCE"] as const;

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const me = useAdminMe();
  const canManage = hasPermission(me, "admin.users.manage");
  const canAssign = hasPermission(me, "admin.admins.manage");

  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<
    null | "suspend" | "unsuspend" | "assign" | "revoke"
  >(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [assignRole, setAssignRole] = useState<string>("SUPPORT");

  const load = useCallback(async () => {
    try {
      const res = await adminGet<UserDetail>(`/api/admin/users/${id}`);
      setData(res);
      setError("");
    } catch (e) {
      setData(null);
      setError(
        e instanceof AdminApiError ? e.message : "Не удалось загрузить пользователя",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await adminGet<UserDetail>(`/api/admin/users/${id}`);
        if (cancelled) return;
        setData(res);
        setError("");
      } catch (e) {
        if (cancelled) return;
        setData(null);
        setError(
          e instanceof AdminApiError
            ? e.message
            : "Не удалось загрузить пользователя",
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
        await adminPost(`/api/admin/users/${id}`, {
          action: dialog,
          reason,
        });
      } else if (dialog === "assign") {
        await adminPost(`/api/admin/users/${id}`, {
          action: "assign_role",
          role: assignRole,
        });
      } else if (dialog === "revoke") {
        await adminPost(`/api/admin/users/${id}`, {
          action: "revoke_role",
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
        {error || "Пользователь не найден"}
      </div>
    );
  }

  return (
    <div>
      <p className="admin-page-desc" style={{ marginBottom: 8 }}>
        <Link href="/admin/users">← Пользователи</Link>
      </p>
      <h1 className="admin-page-title">{data.name}</h1>
      <p className="admin-page-desc">
        @{data.username} · {data.publicId}{" "}
        {data.suspended ? (
          <StatusBadge status="suspended" />
        ) : (
          <StatusBadge status="active" />
        )}
      </p>

      {actionError ? (
        <p className="admin-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="admin-panel">
        <h2 className="admin-panel__title">Профиль</h2>
        <dl className="admin-detail-grid">
          <div className="admin-detail-item">
            <dt>Email</dt>
            <dd>{data.email || "—"}</dd>
          </div>
          <div className="admin-detail-item">
            <dt>Роль платформы</dt>
            <dd>{data.adminRole || "—"}</dd>
          </div>
          <div className="admin-detail-item">
            <dt>Создан</dt>
            <dd>{formatDateTime(data.createdAt)}</dd>
          </div>
          <div className="admin-detail-item">
            <dt>Последняя активность</dt>
            <dd>{formatDateTime(data.lastActiveAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="admin-panel">
        <h2 className="admin-panel__title">Бизнесы</h2>
        {data.businesses.length === 0 ? (
          <div className="admin-state" style={{ border: "none", padding: 8 }}>
            Нет членств
          </div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.8125rem" }}>
            {data.businesses.map((b) => (
              <li key={b.publicId} style={{ marginBottom: 6 }}>
                <Link href={`/admin/businesses/${b.publicId}`}>{b.name}</Link>
                {" · "}
                {b.role} · {b.status}
                {b.archived ? " · архив" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="admin-panel">
        <h2 className="admin-panel__title">Приостановки</h2>
        {data.suspensions.length === 0 ? (
          <div className="admin-state" style={{ border: "none", padding: 8 }}>
            История пуста
          </div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.8125rem" }}>
            {data.suspensions.map((s, i) => (
              <li key={i}>
                {formatDateTime(s.createdAt)}
                {s.liftedAt ? ` → снят ${formatDateTime(s.liftedAt)}` : " · активна"}
                : {s.reason}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage ? (
        <div className="admin-danger-zone">
          <h3>Опасная зона</h3>
          <p>
            Приостановка блокирует доступ пользователя к продукту. Требуется
            причина.
          </p>
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
              Приостановить
            </button>
          )}
        </div>
      ) : null}

      {canAssign ? (
        <div className="admin-panel" style={{ marginTop: 14 }}>
          <h2 className="admin-panel__title">Роли платформы</h2>
          <p className="admin-page-desc">
            Назначение через API (bootstrap CLI — для первого SUPER_ADMIN).
          </p>
          <div className="admin-toolbar">
            <select
              value={assignRole}
              aria-label="Роль"
              onChange={(e) => setAssignRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button button--primary button--sm"
              onClick={() => {
                setActionError("");
                setDialog("assign");
              }}
            >
              Назначить роль
            </button>
            {data.adminRole ? (
              <button
                type="button"
                className="button button--outline button--sm"
                onClick={() => {
                  setActionError("");
                  setDialog("revoke");
                }}
              >
                Отозвать роль
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <AdminConfirmDialog
        open={dialog === "suspend" || dialog === "unsuspend" || dialog === "revoke"}
        title={
          dialog === "suspend"
            ? "Приостановить пользователя?"
            : dialog === "unsuspend"
              ? "Снять приостановку?"
              : "Отозвать роль платформы?"
        }
        description={
          dialog === "assign"
            ? undefined
            : "Действие записывается в аудит. Укажите причину."
        }
        danger={dialog === "suspend" || dialog === "revoke"}
        requireReason
        busy={busy}
        error={actionError}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => void runAction(reason)}
      />

      <AdminConfirmDialog
        open={dialog === "assign"}
        title={`Назначить роль ${assignRole}?`}
        description="Пользователь получит доступ к панели согласно роли."
        requireReason={false}
        busy={busy}
        error={actionError}
        confirmLabel="Назначить"
        onCancel={() => setDialog(null)}
        onConfirm={() => void runAction("")}
      />
    </div>
  );
}
