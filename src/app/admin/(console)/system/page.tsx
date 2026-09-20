"use client";

import { useEffect, useState } from "react";
import { AdminApiError, adminGet } from "@/components/admin/admin-api";
import { StatusBadge, healthBadge } from "@/components/admin/StatusBadge";
import { formatNumber } from "@/components/admin/format";

type SystemData = {
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
  }[];
  connections: {
    telegramConnected: number;
    telegramError: number;
    vkConnected: number;
    vkError: number;
  };
  activity: { orders: number; leads: number; bookings: number };
};

export default function AdminSystemPage() {
  const [data, setData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await adminGet<SystemData>("/api/admin/system");
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof AdminApiError
              ? e.message
              : "Не удалось загрузить систему",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1 className="admin-page-title">Система</h1>
      <p className="admin-page-desc">Здоровье сервисов и воркеров</p>
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
          <div className="admin-panel">
            <h2 className="admin-panel__title">Компоненты</h2>
            <div className="admin-panel__grid">
              <div className="admin-stat-row">
                <span>Web</span>
                <StatusBadge status={healthBadge(data.health.web)} />
              </div>
              <div className="admin-stat-row">
                <span>Database</span>
                <StatusBadge status={healthBadge(data.health.database)} />
              </div>
              {Object.entries(data.health.workers).map(([name, status]) => (
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
          </div>

          <div className="admin-panel">
            <h2 className="admin-panel__title">Каналы</h2>
            <div className="admin-panel__grid">
              <div className="admin-stat-row">
                <span>Telegram connected</span>
                <span>{formatNumber(data.connections.telegramConnected)}</span>
              </div>
              <div className="admin-stat-row">
                <span>Telegram error</span>
                <span>{formatNumber(data.connections.telegramError)}</span>
              </div>
              <div className="admin-stat-row">
                <span>VK connected</span>
                <span>{formatNumber(data.connections.vkConnected)}</span>
              </div>
              <div className="admin-stat-row">
                <span>VK error</span>
                <span>{formatNumber(data.connections.vkError)}</span>
              </div>
            </div>
          </div>

          <div className="admin-panel">
            <h2 className="admin-panel__title">Алерты</h2>
            {data.alerts.length === 0 ? (
              <div className="admin-state">Нет алертов</div>
            ) : (
              <ul className="admin-alert-list">
                {data.alerts.map((a, i) => (
                  <li
                    key={`${a.code}-${i}`}
                    className={`admin-alert admin-alert--${a.severity}`}
                  >
                    {a.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
