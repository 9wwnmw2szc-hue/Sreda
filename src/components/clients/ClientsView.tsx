"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { apiRequest } from "@/lib/apiClient";
type Client = {
  identities?: { kind: string; value: string; username: string | null }[];
  lead_count?: number;
  booking_count?: number;
  open_dialog?: boolean;
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  first_seen_at: string;
  last_seen_at: string;
};
type Detail = {
  hasMore: boolean;
  bookings: {
    id: string;
    starts_at: string;
    status: string;
    service_name: string;
    specialist_name: string;
  }[];
  orders: {
    id: string;
    status: string;
    total: string;
    currency: string;
    created_at: string;
    conversation_id: string | null;
  }[];
  client: Client;
  identities: { kind: string; value: string; username: string | null }[];
  leads: { id: string; name: string; status: string; created_at: string }[];
  conversations: { id: string; status: string; platform: string }[];
  activity: { id: string; type: string; created_at: string }[];
  notes: { id: string; text: string; created_at: string }[];
};
export function ClientsView() {
  const { currentBusiness } = useBusinessContext();
  return currentBusiness ? (
    <Clients
      key={currentBusiness.id}
      businessId={currentBusiness.id}
      timezone={currentBusiness.timezone ?? "UTC"}
    />
  ) : (
    <p>Выберите бизнес.</p>
  );
}
function Clients({
  businessId,
  timezone,
}: {
  businessId: string;
  timezone: string;
}) {
  const [clients, setClients] = useState<Client[]>([]),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [more, setMore] = useState(false),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [historyPage, setHistoryPage] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [form, setForm] = useState({ name: "", phone: "", email: "" }),
    [notice, setNotice] = useState("");
  const base = `/api/v1/businesses/${businessId}/clients`;
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void apiRequest<Client[]>(
        base + "?search=" + encodeURIComponent(search) + "&filter=" + filter,
      )
        .then((x) => {
          if (alive) {
            setClients(x);
            setMore(x.length === 100);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [base, search, filter]);
  useEffect(() => {
    let alive = true;
    if (!selected) return;
    void apiRequest<Detail>(base + "/" + selected)
      .then((x) => {
        if (alive) {
          setDetail(x);
          setHistoryPage(0);
          setForm({
            name: x.client.name,
            phone: x.client.phone ?? "",
            email: x.client.email ?? "",
          });
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [base, selected]);
  async function loadMore() {
    setBusy(true);
    try {
      const rows = await apiRequest<Client[]>(
        base +
          "?search=" +
          encodeURIComponent(search) +
          "&filter=" +
          filter +
          "&after=" +
          clients.at(-1)!.id,
      );
      setClients([...clients, ...rows]);
      setMore(rows.length === 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить.");
    } finally {
      setBusy(false);
    }
  }
  async function moreHistory() {
    if (!detail) return;
    setBusy(true);
    try {
      const next = await apiRequest<Detail>(
        base + "/" + selected + "?page=" + (historyPage + 1),
      );
      const unique = <T extends { id: string }>(a: T[], b: T[]) => [
        ...a,
        ...b.filter((v) => !a.some((old) => old.id === v.id)),
      ];
      setDetail({
        ...detail,
        hasMore: next.hasMore,
        leads: unique(detail.leads, next.leads),
        bookings: unique(detail.bookings, next.bookings),
        orders: unique(detail.orders, next.orders),
        notes: unique(detail.notes, next.notes),
        activity: unique(detail.activity, next.activity),
      });
      setHistoryPage(historyPage + 1);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось загрузить историю.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (busy || (selected && !detail)) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ id: string }>(
        base + (selected ? "/" + selected : ""),
        { method: selected ? "PATCH" : "POST", body: JSON.stringify(form) },
      );
      setClients(await apiRequest<Client[]>(base));
      setSelected(result.id);
      setDetail(await apiRequest<Detail>(base + "/" + result.id));
      setHistoryPage(0);
      setNotice("Данные клиента сохранены.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }
  async function addNote() {
    setBusy(true);
    try {
      await apiRequest(base + "/" + selected, {
        method: "POST",
        body: JSON.stringify({ text: note }),
      });
      setNote("");
      setDetail(await apiRequest<Detail>(base + "/" + selected));
      setHistoryPage(0);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось сохранить заметку.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="crm-page">
      <header>
        <h1>Клиенты</h1>
        <p>Контакты, обращения и история работы с клиентом.</p>
      </header>
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="crm-columns">
        <section className="panel crm-panel">
          <label>
            Фильтр
            <select
              disabled={busy}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {Object.entries({
                all: "Все",
                new: "Новые за 7 дней",
                active: "Активные за 30 дней",
                leads: "Были заявки",
                bookings: "Были записи",
                open: "Открытый диалог",
              }).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Поиск
            <input
              disabled={busy}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Имя, телефон, username"
            />
          </label>
          <button
            className="button button--outline"
            onClick={() => {
              if (busy) return;
              setSelected("");
              setDetail(null);
              setForm({ name: "", phone: "", email: "" });
            }}
          >
            Новый клиент
          </button>
          {loading ? (
            <p role="status">Загрузка…</p>
          ) : clients.length === 0 ? (
            <p>Клиентов пока нет.</p>
          ) : (
            <ul className="crm-list">
              {clients.map((c) => (
                <li key={c.id}>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setDetail(null);
                      setSelected(c.id);
                    }}
                    aria-pressed={selected === c.id}
                  >
                    <strong>{c.name}</strong>
                    <span>{c.phone ?? "Телефон не указан"}</span>
                    <span>
                      Заявок: {c.lead_count ?? 0} · Записей:{" "}
                      {c.booking_count ?? 0}
                      {c.open_dialog ? " · Открытый диалог" : ""}
                    </span>
                    {c.identities
                      ?.filter((i) => ["telegram", "vk"].includes(i.kind))
                      .map((i) => (
                        <small key={i.kind + i.value}>
                          {i.kind}: {i.username ?? i.value}
                        </small>
                      ))}
                    <small>
                      Первый контакт:{" "}
                      {new Date(c.first_seen_at).toLocaleDateString("ru", {
                        timeZone: timezone,
                      })}
                    </small>
                    <small>
                      Активность:{" "}
                      {new Date(c.last_seen_at).toLocaleDateString("ru", {
                        timeZone: timezone,
                      })}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {more && (
            <button disabled={busy} onClick={() => void loadMore()}>
              Показать ещё
            </button>
          )}
        </section>
        <section className="panel crm-panel">
          <h2>{selected ? "Карточка клиента" : "Новый клиент"}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {(["name", "phone", "email"] as const).map((key, i) => (
              <label key={key}>
                {["Имя", "Телефон", "Email"][i]}
                <input
                  required={key === "name"}
                  type={
                    key === "email" ? "email" : key === "phone" ? "tel" : "text"
                  }
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
            <button
              className="button button--primary"
              disabled={busy || (!!selected && !detail)}
            >
              Сохранить
            </button>
          </form>
          {detail && (
            <>
              <p>
                Первое обращение:{" "}
                {new Date(detail.client.first_seen_at).toLocaleString("ru", {
                  timeZone: timezone,
                })}
              </p>
              {detail.identities.map((i) => (
                <p key={i.kind + i.value}>
                  {i.kind}: {i.username ?? i.value}
                </p>
              ))}
              <h3>Заявки</h3>
              {detail.leads.length ? (
                detail.leads.map((l) => (
                  <p key={l.id}>
                    <Link href="/leads">
                      {new Date(l.created_at).toLocaleDateString("ru", {
                        timeZone: timezone,
                      })}{" "}
                      · {l.status}
                    </Link>
                  </p>
                ))
              ) : (
                <p>Заявок пока нет.</p>
              )}
              <h3>Записи</h3>
              {detail.bookings.length ? (
                detail.bookings.map((b) => (
                  <p key={b.id}>
                    <Link href="/bookings">
                      {new Date(b.starts_at).toLocaleString("ru", {
                        timeZone: timezone,
                      })}{" "}
                      · {b.service_name} · {b.specialist_name} · {b.status}
                    </Link>
                  </p>
                ))
              ) : (
                <p>Записей пока нет.</p>
              )}
              <h3>Заказы</h3>
              {detail.orders?.length ? (
                detail.orders.map((o) => (
                  <p key={o.id}>
                    <Link href="/orders">
                      {new Date(o.created_at).toLocaleDateString("ru", {
                        timeZone: timezone,
                      })}{" "}
                      · {o.status} · {o.total} {o.currency}
                    </Link>
                    {o.conversation_id ? (
                      <>
                        {" · "}
                        <Link href="/messages">Диалог</Link>
                      </>
                    ) : null}
                  </p>
                ))
              ) : (
                <p>Заказов пока нет.</p>
              )}
              <h3>Обращения</h3>
              {detail.conversations.length ? (
                detail.conversations.map((c) => (
                  <p key={c.id}>
                    <Link href="/messages">
                      {c.platform} · {c.status}
                    </Link>
                  </p>
                ))
              ) : (
                <p>Обращений пока нет.</p>
              )}
              <h3>Внутренние заметки</h3>
              {detail.notes.map((n) => (
                <p key={n.id}>{n.text}</p>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void addNote();
                }}
              >
                <label>
                  Новая заметка
                  <textarea
                    required
                    maxLength={4000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button className="button button--outline" disabled={busy}>
                  Добавить заметку
                </button>
              </form>
              <h3>Активность</h3>
              {detail.hasMore && (
                <button disabled={busy} onClick={() => void moreHistory()}>
                  Загрузить более раннюю историю
                </button>
              )}
              {detail.activity.map((a) => (
                <p key={a.id}>
                  {new Date(a.created_at).toLocaleString("ru", {
                    timeZone: timezone,
                  })}{" "}
                  ·{" "}
                  {(
                    {
                      "client.updated": "Данные клиента изменены",
                      "lead.created": "Оставлена заявка",
                      "message.received": "Новое обращение",
                      "lead.processing": "Заявка взята в работу",
                      "lead.closed": "Заявка завершена",
                      "booking.created": "Создана запись",
                      "booking.rescheduled": "Запись перенесена",
                      "booking.cancelled": "Запись отменена",
                      "booking.completed": "Запись завершена",
                      "booking.no_show": "Неявка клиента",
                      "order.created": "Создан заказ",
                      "order.status": "Статус заказа изменён",
                    } as Record<string, string>
                  )[a.type] ?? a.type}
                </p>
              ))}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
