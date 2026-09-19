"use client";
import { NotificationSettings } from "./NotificationSettings";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/apiClient";
import { useBusinessContext } from "@/hooks/useBusinessContext";

type Item = {
  id: string;
  title: string;
  target_path: string;
  created_at: string;
  read_at: string | null;
};

export function NotificationsView() {
  const { currentBusiness } = useBusinessContext();
  return currentBusiness ? (
    <List key={currentBusiness.id} id={currentBusiness.id} />
  ) : (
    <p>Выберите бизнес.</p>
  );
}

function List({ id }: { id: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const url = `/api/v1/businesses/${id}/notifications`;

  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const result = await apiRequest<Item[]>(url);
        if (alive) {
          setItems(result);
          setError("");
        }
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "Не удалось загрузить.");
      } finally {
        if (alive) setLoaded(true);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [url]);

  async function read(item: Item) {
    try {
      await apiRequest(url, {
        method: "PATCH",
        body: JSON.stringify({ id: item.id }),
      });
      setItems((all) =>
        all.map((x) =>
          x.id === item.id ? { ...x, read_at: new Date().toISOString() } : x,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отметить.");
    }
  }

  async function readAll() {
    try {
      await apiRequest(url, {
        method: "PATCH",
        body: JSON.stringify({ all: true }),
      });
      const now = new Date().toISOString();
      setItems((all) =>
        all.map((x) => (x.read_at ? x : { ...x, read_at: now })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отметить.");
    }
  }

  const unread = items.filter((i) => !i.read_at).length;

  return (
    <div className="notif-page">
      <header className="notif-page__header">
        <h1 className="text-page-title">Уведомления</h1>
        <p className="text-body-sm">
          События бизнеса и настройка доставки в Telegram и VK.
        </p>
      </header>

      <NotificationSettings businessId={id} />

      <section className="notif-inbox panel" aria-labelledby="notif-inbox-title">
        <div className="notif-inbox__topline">
          <h2 id="notif-inbox-title" className="text-section-title">
            Лента
          </h2>
          <span className="notif-inbox__count">
            Непрочитанных: {unread}
          </span>
        </div>

        {unread > 0 ? (
          <button
            type="button"
            className="button button--outline button--sm"
            onClick={() => void readAll()}
          >
            Прочитать все
          </button>
        ) : null}

        {error ? (
          <p className="account-error" role="alert">
            {error}
          </p>
        ) : null}

        {!loaded ? (
          <p className="text-body-sm">Загрузка…</p>
        ) : !items.length ? (
          <div className="empty-state">
            <p>
              <strong>Уведомлений пока нет</strong>
            </p>
            <p className="empty-copy">
              Когда появятся новые заявки, заказы или сообщения — они отобразятся здесь.
            </p>
          </div>
        ) : (
          <ul className="notif-inbox__list">
            {items.map((i) => (
              <li key={i.id} className={i.read_at ? "is-read" : "is-unread"}>
                <div className="notif-inbox__item">
                  <h3>
                    <Link href={i.target_path}>{i.title}</Link>
                  </h3>
                  <time dateTime={i.created_at}>
                    {new Date(i.created_at).toLocaleString("ru")}
                  </time>
                  {!i.read_at ? (
                    <button
                      type="button"
                      className="button button--ghost button--sm"
                      onClick={() => void read(i)}
                    >
                      Прочитано
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
