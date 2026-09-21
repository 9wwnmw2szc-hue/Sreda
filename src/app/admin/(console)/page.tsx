"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  AdminApiError,
  adminGet,
  hasPermission,
} from "@/components/admin/admin-api";
import { useAdminMe } from "@/components/admin/AdminShell";
import {
  StatusBadge,
  healthBadge,
} from "@/components/admin/StatusBadge";
import { formatNumber } from "@/components/admin/format";

type DashboardData = {
  usersTotal: number;
  businessesTotal: number;
  businessesActive: number;
  registrations7d: number;
  solutionsActive: Record<string, number>;
  connections: {
    telegramConnected: number;
    telegramError: number;
    vkConnected: number;
    vkError: number;
  };
  subscriptions: {
    active: number;
    trial: number;
    expired: number;
    disabled: number;
  };
  activity: { orders: number; leads: number; bookings: number };
  activationFunnel7d?: Record<string, number>;
  health: {
    web: string;
    database: string;
    workers: Record<string, string>;
    storageConfigured: boolean;
    aiConfigured: boolean;
  };
  alerts: {
    severity: "warning" | "error";
    code: string;
    message: string;
    businessPublicId?: string;
  }[];
};

function DashboardInner() {
  const me = useAdminMe();
  const params = useSearchParams();
  const forbidden = params.get("forbidden") === "1";
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasPermission(me, "admin.system.read")) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await adminGet<DashboardData>("/api/admin/dashboard");
        if (cancelled) return;
        setData(res);
        setError("");
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof AdminApiError
              ? e.message
              : "Не удалось загрузить обзор",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me]);

  if (!hasPermission(me, "admin.system.read")) {
    return (
      <div>
        <h1 className="admin-page-title">Панель администратора</h1>
        <p className="admin-page-desc">
          У вашей роли нет доступа к обзору. Выберите раздел в меню слева.
        </p>
        {forbidden ? (
          <p className="admin-error" role="alert">
            Недостаточно прав для запрошенного раздела.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <h1 className="admin-page-title">Обзор</h1>
      <p className="admin-page-desc">
        Состояние платформы и события, требующие внимания
      </p>
      {forbidden ? (
        <p className="admin-error" role="alert">
          Недостаточно прав для запрошенного раздела.
        </p>
      ) : null}

      {loading ? (
        <div className="admin-state" role="status">
          Загрузка…
        </div>
      ) : error ? (
        <div className="admin-state admin-state--error" role="alert">
          {error}
        </div>
      ) : data ? (
        <>
          <div className="admin-kpi-grid">
            <div className="admin-kpi">
              <p className="admin-kpi__label">Пользователи</p>
              <p className="admin-kpi__value">
                {formatNumber(data.usersTotal)}
              </p>
            </div>
            <div className="admin-kpi">
              <p className="admin-kpi__label">Бизнесы</p>
              <p className="admin-kpi__value">
                {formatNumber(data.businessesActive)}
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    color: "var(--text-muted)",
                    marginLeft: 6,
                  }}
                >
                  / {formatNumber(data.businessesTotal)}
                </span>
              </p>
            </div>
            <div className="admin-kpi">
              <p className="admin-kpi__label">Регистрации за 7 дней</p>
              <p className="admin-kpi__value">
                {formatNumber(data.registrations7d)}
              </p>
            </div>
            <div className="admin-kpi">
              <p className="admin-kpi__label">Подписки active/trial</p>
              <p className="admin-kpi__value">
                {formatNumber(
                  data.subscriptions.active + data.subscriptions.trial,
                )}
              </p>
            </div>
          </div>

          {data.activationFunnel7d &&
          Object.keys(data.activationFunnel7d).length > 0 ? (
            <div className="admin-panel">
              <h2 className="admin-panel__title">
                Активация (7 дней) — доходят ли до первого результата?
              </h2>
              <div className="admin-panel__grid">
                {[
                  ["registration_completed", "Регистрация"],
                  ["business_created", "Бизнес создан"],
                  ["solution_activated", "Решение включено"],
                  ["channel_connected", "Канал подключён"],
                  ["first_order", "Первый заказ"],
                  ["first_lead", "Первая заявка"],
                  ["first_booking", "Первая запись"],
                  ["first_reply", "Первый ответ"],
                  ["setup_completed", "Настройка завершена"],
                ].map(([key, label]) => (
                  <div className="admin-stat-row" key={key}>
                    <span>{label}</span>
                    <strong>
                      {formatNumber(data.activationFunnel7d?.[key] ?? 0)}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="admin-panel">
            <h2 className="admin-panel__title">Здоровье</h2>
            <div className="admin-panel__grid">
              <div className="admin-stat-row">
                <span>Web</span>
                <StatusBadge status={healthBadge(data.health.web)} />
              </div>
              <div className="admin-stat-row">
                <span>Database</span>
                <StatusBadge status={healthBadge(data.health.database)} />
              </div>
              {Object.entries(data.health.workers ?? {}).map(([name, status]) => (
                <div className="admin-stat-row" key={name}>
                  <span>{name}</span>
                  <StatusBadge status={healthBadge(status)} />
                </div>
              ))}
              <div className="admin-stat-row">
                <span>Storage</span>
                <span>
                  {data.health.storageConfigured
                    ? "configured"
                    : "not_configured"}
                </span>
              </div>
              <div className="admin-stat-row">
                <span>AI</span>
                <span>
                  {data.health.aiConfigured ? "configured" : "not_configured"}
                </span>
              </div>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: "0.75rem" }}>
              <Link href="/admin/system">Подробнее о системе →</Link>
            </p>
          </div>

          <div className="admin-panel">
            <h2 className="admin-panel__title">Требует внимания</h2>
            {data.alerts.length === 0 ? (
              <div className="admin-state" style={{ border: "none", padding: 12 }}>
                Сейчас нет алертов
              </div>
            ) : (
              <ul className="admin-alert-list">
                {data.alerts.map((a, i) => (
                  <li
                    key={`${a.code}-${i}`}
                    className={`admin-alert admin-alert--${a.severity}`}
                  >
                    <StatusBadge
                      status={a.severity === "error" ? "error" : "warning"}
                    />
                    <div>
                      <div>{a.message}</div>
                      {a.businessPublicId ? (
                        <Link
                          href={`/admin/businesses/${a.businessPublicId}`}
                          style={{ fontSize: "0.75rem" }}
                        >
                          Открыть бизнес
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="admin-panel">
            <h2 className="admin-panel__title">Каналы и активность</h2>
            <div className="admin-panel__grid">
              <div className="admin-stat-row">
                <span>Telegram OK / err</span>
                <span>
                  {formatNumber(data.connections.telegramConnected)} /{" "}
                  {formatNumber(data.connections.telegramError)}
                </span>
              </div>
              <div className="admin-stat-row">
                <span>VK OK / err</span>
                <span>
                  {formatNumber(data.connections.vkConnected)} /{" "}
                  {formatNumber(data.connections.vkError)}
                </span>
              </div>
              <div className="admin-stat-row">
                <span>Заказы</span>
                <span>{formatNumber(data.activity.orders)}</span>
              </div>
              <div className="admin-stat-row">
                <span>Заявки</span>
                <span>{formatNumber(data.activity.leads)}</span>
              </div>
              <div className="admin-stat-row">
                <span>Записи</span>
                <span>{formatNumber(data.activity.bookings)}</span>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-state" role="status">
          Загрузка…
        </div>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}
