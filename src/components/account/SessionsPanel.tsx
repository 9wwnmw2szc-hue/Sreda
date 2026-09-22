"use client";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";

type SessionItem = {
  id: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  userAgent?: string | null;
  deviceLabel?: string;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const data = await apiRequest<{ sessions: SessionItem[] }>(
      "/api/v1/account/sessions",
    );
    setSessions(data.sessions);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      void refresh()
        .catch((e) => {
          if (live) setError(e instanceof Error ? e.message : "Ошибка");
        })
        .finally(() => {
          if (live) setLoaded(true);
        });
    }, 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [refresh]);

  async function revokeOne(sessionId: string) {
    setBusyId(sessionId);
    setError("");
    setNotice("");
    try {
      await apiRequest("/api/v1/account/sessions", {
        method: "POST",
        body: JSON.stringify({ action: "revoke", sessionId }),
      });
      await refresh();
      setNotice("Сессия завершена.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось завершить сессию.");
    } finally {
      setBusyId(null);
    }
  }

  async function revokeOthers() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Завершить все сеансы на других устройствах?")
    )
      return;
    setBusyAll(true);
    setError("");
    setNotice("");
    try {
      await apiRequest("/api/v1/account/sessions", {
        method: "POST",
        body: JSON.stringify({ action: "revoke_others" }),
      });
      await refresh();
      setNotice("Сеансы на других устройствах завершены.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить сессии.");
    } finally {
      setBusyAll(false);
    }
  }

  const others = sessions.filter((s) => !s.current).length;

  return (
    <section className="panel settings-panel">
      <h2 className="text-section-title">Сессии</h2>
      <p className="text-body-sm">
        Текущий вход и другие активные устройства. После смены пароля остальные
        сессии завершаются автоматически.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="account-notice" role="status">
          {notice}
        </p>
      ) : null}
      {!loaded ? (
        <p className="text-body-sm">Загрузка…</p>
      ) : !sessions.length ? (
        <p className="text-body-sm">Активных сессий не найдено.</p>
      ) : (
        <ul className="session-list">
          {sessions.map((s) => (
            <li
              key={s.id}
              className={`session-card${s.current ? " session-card--current" : ""}`}
            >
              <div className="session-card__body">
                <div className="session-card__title-row">
                  <strong className="session-card__title">
                    {s.deviceLabel || "Неизвестное устройство"}
                  </strong>
                  {s.current ? (
                    <span className="session-card__badge">Это устройство</span>
                  ) : null}
                </div>
                <p className="session-card__meta text-caption">
                  Последняя активность: {formatWhen(s.updatedAt)}
                </p>
                <p className="session-card__meta text-caption">
                  Действует до: {formatWhen(s.expiresAt)}
                </p>
              </div>
              {!s.current ? (
                <button
                  type="button"
                  className="button button--ghost button--nowrap session-card__revoke"
                  disabled={busyId === s.id || busyAll}
                  onClick={() => void revokeOne(s.id)}
                >
                  {busyId === s.id ? "…" : "Завершить"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="button button--secondary"
        disabled={busyAll || others === 0}
        onClick={() => void revokeOthers()}
      >
        {busyAll ? "Завершаем…" : "Выйти на всех других устройствах"}
      </button>
    </section>
  );
}
