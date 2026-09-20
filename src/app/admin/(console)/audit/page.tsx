"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminGet } from "@/components/admin/admin-api";
import { AdminDataTable, type AdminColumn } from "@/components/admin/AdminDataTable";
import { formatDateTime } from "@/components/admin/format";

type AuditRow = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  createdAt: string;
  adminRole: string;
  adminPublicId: string;
  adminUsername: string;
  adminName: string;
  businessPublicId: string | null;
  requestId: string | null;
};

type ListResponse = {
  items: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
};

export default function AdminAuditPage() {
  const [admin, setAdmin] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "20");
    if (admin.trim()) params.set("admin", admin.trim());
    if (action.trim()) params.set("action", action.trim());
    try {
      const res = await adminGet<ListResponse>(
        `/api/admin/audit?${params.toString()}`,
      );
      setData(res);
    } catch (e) {
      setData(null);
      setError(
        e instanceof AdminApiError ? e.message : "Не удалось загрузить аудит",
      );
    } finally {
      setLoading(false);
    }
  }, [page, admin, action]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: AdminColumn<AuditRow>[] = [
    {
      key: "when",
      header: "Когда",
      mobilePrimary: true,
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: "admin",
      header: "Админ",
      render: (row) => `@${row.adminUsername} (${row.adminRole})`,
    },
    {
      key: "action",
      header: "Действие",
      render: (row) => row.action,
    },
    {
      key: "target",
      header: "Цель",
      render: (row) =>
        `${row.targetType}${row.targetId ? `: ${row.targetId}` : ""}`,
    },
    {
      key: "biz",
      header: "Бизнес",
      render: (row) => row.businessPublicId || "—",
    },
    {
      key: "reason",
      header: "Причина",
      render: (row) => row.reason || "—",
    },
  ];

  return (
    <div>
      <h1 className="admin-page-title">Аудит</h1>
      <p className="admin-page-desc">
        Неизменяемый журнал действий платформенных админов
      </p>
      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Админ (логин / id)"
          value={admin}
          aria-label="Фильтр админа"
          onChange={(e) => {
            setPage(1);
            setAdmin(e.target.value);
          }}
        />
        <input
          type="search"
          placeholder="Действие"
          value={action}
          aria-label="Фильтр действия"
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
        />
      </div>
      <AdminDataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={loading}
        error={error || null}
        empty="Записей нет"
        getRowKey={(r) => r.id}
        pagination={
          data
            ? {
                page: data.page,
                pageSize: data.pageSize,
                total: data.total,
                onPage: setPage,
              }
            : undefined
        }
      />
    </div>
  );
}
