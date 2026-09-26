"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { initialsFromName } from "@/lib/format";

type BookingRow = {
  id: string;
  starts_at: string;
  client_name?: string | null;
  service_name?: string | null;
  status: string;
};

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeBadge(iso: string): { text: string; tone: string } {
  const mins = Math.round((+new Date(iso) - Date.now()) / 60000);
  if (mins < 0) return { text: "Сейчас", tone: "now" };
  if (mins <= 30) return { text: "Скоро", tone: "soon" };
  if (mins <= 90) return { text: `Через ${Math.max(1, Math.round(mins / 60))} ч`, tone: "soon" };
  return { text: "Запланировано", tone: "planned" };
}

export function TodaySchedule({ businessId }: { businessId: string }) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    let alive = true;
    const day = new Date();
    const from = new Date(day);
    from.setHours(0, 0, 0, 0);
    const until = new Date(day);
    until.setHours(23, 59, 59, 999);
    const url =
      `/api/v1/businesses/${encodeURIComponent(businessId)}/bookings` +
      `?from=${encodeURIComponent(from.toISOString())}` +
      `&until=${encodeURIComponent(until.toISOString())}`;
    void apiRequest<BookingRow[]>(url)
      .then((list) => {
        if (!alive) return;
        setRows(
          [...list]
            .filter((b) => b.status !== "cancelled")
            .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
            .slice(0, 6),
        );
        setReady(true);
      })
      .catch(() => {
        if (alive) {
          setRows([]);
          setReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [businessId]);

  return (
    <section className="panel biznesoty-schedule-panel">
      <div className="panel-heading">
        <h2>Сегодня в расписании</h2>
        <Link href="/bookings" className="text-link">
          Все записи
          <ChevronRight size={16} />
        </Link>
      </div>
      {!ready ? (
        <p className="empty-copy">Загрузка…</p>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <CalendarDays size={26} />
          <p>На сегодня записей нет</p>
          <Link href="/bookings" className="button button--outline">
            Открыть расписание
          </Link>
        </div>
      ) : (
        <ol className="biznesoty-timeline">
          {rows.map((row, index) => {
            const badge = relativeBadge(row.starts_at);
            return (
              <li key={row.id} className="biznesoty-timeline__item">
                <time dateTime={row.starts_at}>{timeLabel(row.starts_at)}</time>
                <span className="biznesoty-timeline__rail" aria-hidden />
                <div className="biznesoty-timeline__card">
                  <span
                    className={`initial-avatar initial-avatar--${index % 3}`}
                  >
                    {initialsFromName(row.client_name || "К")}
                  </span>
                  <div>
                    <strong>{row.client_name || "Клиент"}</strong>
                    <span>{row.service_name || "Запись"}</span>
                  </div>
                  <span className={`status-chip status-chip--${badge.tone}`}>
                    {badge.text}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
