"use client";
import { NotificationSettings } from "./NotificationSettings";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/apiClient";
import { useBusinessContext } from "@/hooks/useBusinessContext";

type Item = {
  id: string;
  title: string;
  target_path: string;
  created_at: string;
  read_at: string | null;
  resolved_at?: string | null;
};

type InboxItem = Item & {
  type: string;
  body?: string | null;
  payload?: { invitationId?: string } | null;
};

export function NotificationsView() {
  const { currentBusiness, refreshBusinesses } = useBusinessContext();
  const router = useRouter();
  return (
    <div className="notif-page">
      <header className="notif-page__header">
        <h1 className="text-page-title">Уведомления</h1>
        <p className="text-body-sm">
          События бизнеса и настройка доставки в Telegram и VK.
        </p>
      </header>

      <AccountInbox
        onAccepted={async () => {
          await refreshBusinesses();
          router.refresh();
        }}
      />

      {currentBusiness ? (
        <>
          <NotificationSettings businessId={currentBusiness.id} />
          <List key={currentBusiness.id} id={currentBusiness.id} />
        </>
      ) : (
        <p className="text-body-sm">Выберите бизнес, чтобы видеть его ленту.</p>
      )}
    </div>
  );
}

function AccountInbox({ onAccepted }: { onAccepted: () => Promise<void> }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState("");

  async function refresh() {
    const result = await apiRequest<InboxItem[]>("/api/v1/inbox");
    setItems(result);
    setError("");
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const result = await apiRequest<InboxItem[]>("/api/v1/inbox");
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
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  async function resolveInbox(id: string) {
    await apiRequest("/api/v1/inbox", {
      method: "PATCH",
      body: JSON.stringify({ id }),
    });
  }

  async function respond(item: InboxItem, action: "accept" | "decline") {
    const invitationId = item.payload?.invitationId;
    if (!invitationId) return;
    setBusyId(item.id);
    setError("");
    try {
      await apiRequest(`/api/v1/invitations/${invitationId}/${action}`, {
        method: "POST",
        body: "{}",
      });
      try {
        await resolveInbox(item.id);
      } catch {
        /* accept/decline already resolves; ignore duplicate */
      }
      setItems((all) =>
        all.map((x) =>
          x.id === item.id
            ? { ...x, resolved_at: new Date().toISOString() }
            : x,
        ),
      );
      if (action === "accept") await onAccepted();
      void refresh().catch(() => undefined);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : action === "accept"
            ? "Не удалось принять."
            : "Не удалось отклонить.",
      );
    } finally {
      setBusyId("");
    }
  }

  const actionable = items.filter((i) => !i.resolved_at).length;

  return (
    <section
      className="notif-inbox panel"
      aria-labelledby="notif-account-inbox-title"
    >
      <div className="notif-inbox__topline">
        <h2 id="notif-account-inbox-title" className="text-section-title">
          Приглашения и личные
        </h2>
        <span className="notif-inbox__count">Активных: {actionable}</span>
      </div>

      {error ? (
        <p className="account-error" role="alert">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <p className="text-body-sm">Загрузка…</p>
      ) : !items.length ? (
        <p className="text-body-sm">Личных уведомлений пока нет.</p>
      ) : (
        <ul className="notif-inbox__list">
          {items.map((i) => {
            const invitationId =
              i.type === "invitation.received"
                ? i.payload?.invitationId
                : undefined;
            return (
              <li
                key={i.id}
                className={i.resolved_at ? "is-read" : "is-unread"}
              >
                <div className="notif-inbox__item">
                  <h3>
                    <Link href={i.target_path}>{i.title}</Link>
                  </h3>
                  {i.body ? <p className="text-body-sm">{i.body}</p> : null}
                  <time dateTime={i.created_at}>
                    {new Date(i.created_at).toLocaleString("ru")}
                  </time>
                  {invitationId && !i.resolved_at ? (
                    <div className="notif-inbox__actions">
                      <button
                        type="button"
                        className="button button--primary button--sm"
                        disabled={busyId === i.id}
                        onClick={() => void respond(i, "accept")}
                      >
                        Принять
                      </button>
                      <button
                        type="button"
                        className="button button--outline button--sm"
                        disabled={busyId === i.id}
                        onClick={() => void respond(i, "decline")}
                      >
                        Отклонить
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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

  const unread = items.filter((i) => !i.read_at && !i.resolved_at).length;

  return (
    <section className="notif-inbox panel" aria-labelledby="notif-inbox-title">
      <div className="notif-inbox__topline">
        <h2 id="notif-inbox-title" className="text-section-title">
          Лента
        </h2>
        <span className="notif-inbox__count">Непрочитанных: {unread}</span>
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
            Когда появятся новые заявки, заказы или сообщения — они отобразятся
            здесь.
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
  );
}
