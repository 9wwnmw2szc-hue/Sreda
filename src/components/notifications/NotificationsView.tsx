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
  const [items, setItems] = useState<Item[]>([]),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
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
    <section className="panel crm-panel">
      <h1>Уведомления</h1>
      <NotificationSettings businessId={id} />
      <p>Непрочитанных: {unread}</p>
      {unread > 0 && (
        <button
          type="button"
          className="button button--outline"
          onClick={() => void readAll()}
        >
          Прочитать все
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {!loaded ? (
        <p>Загрузка…</p>
      ) : !items.length ? (
        <p>Уведомлений пока нет.</p>
      ) : (
        items.map((i) => (
          <article key={i.id}>
            <h2>
              <Link href={i.target_path}>{i.title}</Link>
            </h2>
            <p>{new Date(i.created_at).toLocaleString("ru")}</p>
            {!i.read_at && (
              <button
                className="button button--outline"
                onClick={() => void read(i)}
              >
                Прочитано
              </button>
            )}
          </article>
        ))
      )}
    </section>
  );
}
