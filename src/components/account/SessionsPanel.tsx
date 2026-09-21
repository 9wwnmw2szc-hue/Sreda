"use client";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";

type SessionItem = {
  id: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
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
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

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

  async function act(body: object) {
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/v1/account/sessions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить сессии.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-panel">
      <h2>Сессии</h2>
      <p className="muted">
        Текущий вход и другие активные устройства. После смены пароля остальные
        сессии завершаются автоматически.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {!loaded ? (
        <p className="muted">Загрузка…</p>
      ) : !sessions.length ? (
        <p className="muted">Активных сессий не найдено.</p>
      ) : (
        <ul className="session-list">
          {sessions.map((s) => (
            <li key={s.id} className="session-list__item">
              <div>
                <strong>
                  {s.current ? "Это устройство" : "Другое устройство"}
                </strong>
                <p className="muted">
                  Активность: {formatWhen(s.updatedAt)} · до{" "}
                  {formatWhen(s.expiresAt)}
                </p>
              </div>
              {!s.current ? (
                <button
                  type="button"
                  className="button button--ghost button--sm"
                  disabled={busy}
                  onClick={() => act({ action: "revoke", sessionId: s.id })}
                >
                  Завершить
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="button button--secondary"
        disabled={busy || sessions.filter((s) => !s.current).length === 0}
        onClick={() => {
          if (
            typeof window !== "undefined" &&
            !window.confirm("Завершить все сессии на других устройствах?")
          )
            return;
          void act({ action: "revoke_others" });
        }}
      >
        Выйти на всех устройствах
      </button>
    </section>
  );
}
