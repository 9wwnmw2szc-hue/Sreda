"use client";

import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AdminApiError, adminGet } from "@/components/admin/admin-api";
import { AdminDataTable, type AdminColumn } from "@/components/admin/AdminDataTable";
import {
  StatusBadge,
  connectionStatusBadge,
} from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/components/admin/format";

type IntRow = {
  connectionId: string;
  platform: string;
  status: string;
  displayName: string | null;
  externalAccountId: string | null;
  businessPublicId: string;
  businessName: string;
  secretConfigured: string;
  createdAt: string;
  updatedAt: string;
};

type ListResponse = {
  items: IntRow[];
  total: number;
  page: number;
  pageSize: number;
};

function IntegrationsInner() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") || "";
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState(initialStatus);
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
      if (platform) params.set("platform", platform);
      if (status) params.set("status", status);
      try {
        const res = await adminGet<ListResponse>(
          `/api/admin/integrations?${params.toString()}`,
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
            : "Не удалось загрузить интеграции",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, q, platform, status]);

  const columns: AdminColumn<IntRow>[] = [
    {
      key: "biz",
      header: "Бизнес",
      mobilePrimary: true,
      render: (row) => (
        <Link href={`/admin/integrations/${row.connectionId}`}>
          {row.businessName}
        </Link>
      ),
    },
    {
      key: "platform",
      header: "Платформа",
      render: (row) => row.platform,
    },
    {
      key: "status",
      header: "Статус",
      render: (row) => (
        <StatusBadge status={connectionStatusBadge(row.status)} />
      ),
    },
    {
      key: "name",
      header: "Аккаунт",
      render: (row) => row.displayName || row.externalAccountId || "—",
    },
    {
      key: "secret",
      header: "Секрет",
      render: (row) => row.secretConfigured,
    },
    {
      key: "upd",
      header: "Обновлено",
      render: (row) => formatDateTime(row.updatedAt),
    },
  ];

  return (
    <div>
      <h1 className="admin-page-title">Интеграции</h1>
      <p className="admin-page-desc">Подключения Telegram и VK</p>
      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Бизнес, аккаунт…"
          value={q}
          aria-label="Поиск интеграций"
          onChange={(e) => {
            setLoading(true);
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          value={platform}
          aria-label="Платформа"
          onChange={(e) => {
            setLoading(true);
            setPage(1);
            setPlatform(e.target.value);
          }}
        >
          <option value="">Все платформы</option>
          <option value="telegram">Telegram</option>
          <option value="vk">VK</option>
        </select>
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
          <option value="connected">connected</option>
          <option value="error">error</option>
          <option value="pending">pending</option>
          <option value="disconnected">disconnected</option>
        </select>
      </div>
      <AdminDataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={loading}
        error={error || null}
        empty="Интеграции не найдены"
        getRowKey={(r) => r.connectionId}
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

export default function AdminIntegrationsPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-state" role="status">
          Загрузка…
        </div>
      }
    >
      <IntegrationsInner />
    </Suspense>
  );
}
