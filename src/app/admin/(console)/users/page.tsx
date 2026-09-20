"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminGet } from "@/components/admin/admin-api";
import { AdminDataTable, type AdminColumn } from "@/components/admin/AdminDataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/components/admin/format";

type UserRow = {
  publicId: string;
  name: string;
  username: string;
  email: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  businessCount: number;
  suspended: boolean;
  adminRole: string | null;
};

type UsersResponse = {
  items: UserRow[];
  total: number;
  page: number;
  pageSize: number;
};

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [adminOnly, setAdminOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "20");
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (adminOnly) params.set("admin", "1");
    try {
      const res = await adminGet<UsersResponse>(
        `/api/admin/users?${params.toString()}`,
      );
      setData(res);
    } catch (e) {
      setData(null);
      setError(
        e instanceof AdminApiError ? e.message : "Не удалось загрузить пользователей",
      );
    } finally {
      setLoading(false);
    }
  }, [page, q, status, adminOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: AdminColumn<UserRow>[] = [
    {
      key: "name",
      header: "Пользователь",
      mobilePrimary: true,
      render: (row) => (
        <Link href={`/admin/users/${row.publicId}`}>
          {row.name}
          <span
            style={{
              display: "block",
              fontWeight: 400,
              color: "var(--text-muted)",
              fontSize: "0.75rem",
            }}
          >
            @{row.username}
          </span>
        </Link>
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (row) => row.email || "—",
    },
    {
      key: "status",
      header: "Статус",
      render: (row) =>
        row.suspended ? (
          <StatusBadge status="suspended" />
        ) : (
          <StatusBadge status="active" />
        ),
    },
    {
      key: "role",
      header: "Роль платформы",
      render: (row) => row.adminRole || "—",
    },
    {
      key: "biz",
      header: "Бизнесы",
      render: (row) => row.businessCount,
    },
    {
      key: "last",
      header: "Активность",
      render: (row) => formatDateTime(row.lastActiveAt),
    },
  ];

  return (
    <div>
      <h1 className="admin-page-title">Пользователи</h1>
      <p className="admin-page-desc">Поиск и просмотр аккаунтов платформы</p>
      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Имя, логин, email, id…"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          aria-label="Поиск пользователей"
        />
        <select
          value={status}
          aria-label="Фильтр статуса"
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">Все статусы</option>
          <option value="active">Активные</option>
          <option value="suspended">Приостановленные</option>
        </select>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: "0.8125rem",
          }}
        >
          <input
            type="checkbox"
            checked={adminOnly}
            onChange={(e) => {
              setPage(1);
              setAdminOnly(e.target.checked);
            }}
          />
          Только админы
        </label>
      </div>
      <AdminDataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={loading}
        error={error || null}
        empty="Пользователи не найдены"
        getRowKey={(r) => r.publicId}
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
