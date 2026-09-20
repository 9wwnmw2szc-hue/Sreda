"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminApiError, adminGet } from "@/components/admin/admin-api";
import { AdminDataTable, type AdminColumn } from "@/components/admin/AdminDataTable";
import {
  StatusBadge,
  connectionStatusBadge,
  solutionStatusBadge,
} from "@/components/admin/StatusBadge";
import { formatDateTime, solutionLabel } from "@/components/admin/format";

type BusinessRow = {
  publicId: string;
  name: string;
  ownerName: string;
  ownerUsername: string;
  industry: string | null;
  businessModel: string | null;
  createdAt: string;
  solutions: { code: string; status: string; expiresAt: string | null }[];
  telegramStatus: string | null;
  vkStatus: string | null;
  suspended: boolean;
  archived: boolean;
};

type ListResponse = {
  items: BusinessRow[];
  total: number;
  page: number;
  pageSize: number;
};

export default function AdminBusinessesPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [telegram, setTelegram] = useState("");
  const [vk, setVk] = useState("");
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
      if (telegram) params.set("telegram", telegram);
      if (vk) params.set("vk", vk);
      try {
        const res = await adminGet<ListResponse>(
          `/api/admin/businesses?${params.toString()}`,
        );
        if (cancelled) return;
        setData(res);
        setError("");
      } catch (e) {
        if (cancelled) return;
        setData(null);
        setError(
          e instanceof AdminApiError ? e.message : "Не удалось загрузить бизнесы",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, q, status, telegram, vk]);

  const columns: AdminColumn<BusinessRow>[] = [
    {
      key: "name",
      header: "Бизнес",
      mobilePrimary: true,
      render: (row) => (
        <Link href={`/admin/businesses/${row.publicId}`}>{row.name}</Link>
      ),
    },
    {
      key: "owner",
      header: "Владелец",
      render: (row) => (
        <>
          {row.ownerName}
          <span
            style={{
              display: "block",
              color: "var(--text-muted)",
              fontSize: "0.75rem",
            }}
          >
            @{row.ownerUsername}
          </span>
        </>
      ),
    },
    {
      key: "status",
      header: "Статус",
      render: (row) =>
        row.suspended ? (
          <StatusBadge status="suspended" />
        ) : row.archived ? (
          <StatusBadge status="disabled" label="Архив" />
        ) : (
          <StatusBadge status="active" />
        ),
    },
    {
      key: "tg",
      header: "Telegram",
      render: (row) => (
        <StatusBadge status={connectionStatusBadge(row.telegramStatus)} />
      ),
    },
    {
      key: "vk",
      header: "VK",
      render: (row) => (
        <StatusBadge status={connectionStatusBadge(row.vkStatus)} />
      ),
    },
    {
      key: "sol",
      header: "Решения",
      render: (row) =>
        row.solutions.length === 0 ? (
          "—"
        ) : (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {row.solutions.map((s) => (
              <StatusBadge
                key={s.code}
                status={solutionStatusBadge(s.status)}
                label={solutionLabel(s.code)}
              />
            ))}
          </span>
        ),
    },
    {
      key: "created",
      header: "Создан",
      render: (row) => formatDateTime(row.createdAt),
    },
  ];

  return (
    <div>
      <h1 className="admin-page-title">Бизнесы</h1>
      <p className="admin-page-desc">Тенанты и их каналы</p>
      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Название, id…"
          value={q}
          aria-label="Поиск бизнесов"
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
          <option value="active">Активные</option>
          <option value="suspended">Приостановленные</option>
          <option value="archived">Архив</option>
        </select>
        <select
          value={telegram}
          aria-label="Telegram"
          onChange={(e) => {
            setLoading(true);
            setPage(1);
            setTelegram(e.target.value);
          }}
        >
          <option value="">Telegram: любой</option>
          <option value="connected">Подключен</option>
          <option value="error">Ошибка</option>
          <option value="disconnected">Отключен</option>
        </select>
        <select
          value={vk}
          aria-label="VK"
          onChange={(e) => {
            setLoading(true);
            setPage(1);
            setVk(e.target.value);
          }}
        >
          <option value="">VK: любой</option>
          <option value="connected">Подключен</option>
          <option value="error">Ошибка</option>
          <option value="disconnected">Отключен</option>
        </select>
      </div>
      <AdminDataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={loading}
        error={error || null}
        empty="Бизнесы не найдены"
        getRowKey={(r) => r.publicId}
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
