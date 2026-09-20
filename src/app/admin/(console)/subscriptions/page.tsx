"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminApiError, adminGet } from "@/components/admin/admin-api";
import { AdminDataTable, type AdminColumn } from "@/components/admin/AdminDataTable";
import { StatusBadge, solutionStatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime, solutionLabel } from "@/components/admin/format";

type SubRow = {
  businessPublicId: string;
  businessName: string;
  ownerName: string;
  ownerUsername: string;
  solutionCode: string;
  status: string;
  startsAt: string;
  expiresAt: string | null;
  updatedAt: string;
};

type ListResponse = {
  items: SubRow[];
  total: number;
  page: number;
  pageSize: number;
};

export default function AdminSubscriptionsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", "20");
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      try {
        const res = await adminGet<ListResponse>(
          `/api/admin/subscriptions?${params.toString()}`,
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
            : "Не удалось загрузить подписки",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, q, status]);

  const columns: AdminColumn<SubRow>[] = [
    {
      key: "biz",
      header: "Бизнес",
      mobilePrimary: true,
      render: (row) => (
        <Link href={`/admin/businesses/${row.businessPublicId}`}>
          {row.businessName}
        </Link>
      ),
    },
    {
      key: "sol",
      header: "Решение",
      render: (row) => solutionLabel(row.solutionCode),
    },
    {
      key: "status",
      header: "Статус",
      render: (row) => (
        <StatusBadge status={solutionStatusBadge(row.status)} />
      ),
    },
    {
      key: "owner",
      header: "Владелец",
      render: (row) => `@${row.ownerUsername}`,
    },
    {
      key: "exp",
      header: "Истекает",
      render: (row) => formatDateTime(row.expiresAt),
    },
    {
      key: "upd",
      header: "Обновлено",
      render: (row) => formatDateTime(row.updatedAt),
    },
  ];

  return (
    <div>
      <h1 className="admin-page-title">Подписки</h1>
      <p className="admin-page-desc">Решения бизнесов и сроки</p>
      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Бизнес, решение…"
          value={q}
          aria-label="Поиск подписок"
          onChange={(e) => {
            setLoading(true);
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          value={status}
          aria-label="Статус"
          onChange={(e) => {
            setLoading(true);
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">Все статусы</option>
          <option value="active">active</option>
          <option value="trial">trial</option>
          <option value="expired">expired</option>
          <option value="disabled">disabled</option>
        </select>
      </div>
      <AdminDataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={loading}
        error={error || null}
        empty="Подписки не найдены"
        getRowKey={(r) => `${r.businessPublicId}:${r.solutionCode}`}
        pagination={
          data
            ? {
                page: data.page,
                pageSize: data.pageSize,
                total: data.total,
                onPage: (p) => {
                  setLoading(true);
                  setPage(p);
                },
              }
            : undefined
        }
      />
    </div>
  );
}
