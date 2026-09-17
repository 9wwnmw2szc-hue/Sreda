"use client";
import {
  AttachmentPicker,
  type FileItem,
} from "@/components/attachments/AttachmentPicker";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/apiClient";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import {
  EmptyStateCta,
  SolutionSetupBanner,
} from "@/components/solutions/SolutionSetupBanner";
type Conversation = {
  id: string;
  platform: string;
  clientId?: string | null;
  clientName?: string;
  externalUserId: string;
  externalUsername: string | null;
  status: string;
  lastMessageAt: string;
  lastMessage: string;
  unread: number;
  assignedName?: string;
};
type Message = {
  attachments?: FileItem[];
  id: string;
  direction: string;
  text: string;
  createdAt: string;
  deliveryStatus: string;
};
export function MessagesView() {
  const { currentBusiness } = useBusinessContext();
  return currentBusiness ? (
    <Inbox
      key={currentBusiness.id}
      businessId={currentBusiness.id}
      timezone={currentBusiness.timezone ?? "UTC"}
    />
  ) : (
    <p>Выберите бизнес.</p>
  );
}
function Inbox({
  businessId,
  timezone,
}: {
  businessId: string;
  timezone: string;
}) {
  const [files, setFiles] = useState<FileItem[]>([]),
    [uploading, setUploading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]),
    [selected, setSelected] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [filter, setFilter] = useState(""),
    [page, setPage] = useState(0),
    [messagePage, setMessagePage] = useState(0);
  const requestKey = useRef("");
  const base = `/api/v1/businesses/${businessId}/conversations`;
  const current = conversations.find((c) => c.id === selected);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const list = await apiRequest<Conversation[]>(
          base + "?status=" + filter + "&page=" + page,
        );
        if (active) {
          setConversations(list);
          setLoaded(true);
          setError("");
        }
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить диалоги.",
          );
          setLoaded(true);
        }
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [base, filter, page]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    async function refresh() {
      try {
        const list = await apiRequest<Message[]>(
          base + "/" + selected + "?page=" + messagePage,
        );
        if (active) setMessages(list);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить сообщения.",
          );
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [base, selected, messagePage]);
  async function status(value: string) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(base + "/" + selected, {
        method: "PATCH",
        body: JSON.stringify({ status: value }),
      });
      setConversations(
        await apiRequest<Conversation[]>(
          base + "?status=" + filter + "&page=" + page,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить статус.");
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if ((!text.trim() && !files.length) || busy || uploading) return;
    setBusy(true);
    setError("");
    requestKey.current ||= crypto.randomUUID();
    try {
      await apiRequest(base + "/" + selected, {
        method: "POST",
        body: JSON.stringify({
          text,
          attachments: files.map((f) => f.id),
          requestKey: requestKey.current,
        }),
      });
      setText("");
      setFiles([]);
      requestKey.current = "";
      setMessagePage(0);
      setMessages(await apiRequest<Message[]>(base + "/" + selected));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <h1>Сообщения</h1>
      <p>Бесплатный inbox · до 300 сообщений в месяц на бизнес.</p>
      <SolutionSetupBanner code="admin_messages" />
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      <div className="crm-columns">
        <section className="panel crm-panel">
          <nav aria-label="Страницы диалогов">
            <button disabled={!page} onClick={() => setPage(page - 1)}>
              Предыдущая
            </button>
            <span> {page + 1} </span>
            <button
              disabled={conversations.length < 100}
              onClick={() => setPage(page + 1)}
            >
              Следующая
            </button>
          </nav>
          <label>
            Статус
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
            >
              {[
                ["", "Все"],
                ["open", "Новые"],
                ["assigned", "В работе"],
                ["closed", "Закрытые"],
                ["blocked", "Заблокированные"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {!loaded ? (
            <p>Загрузка…</p>
          ) : !conversations.length ? (
            <EmptyStateCta
              title="Сообщений пока нет"
              description="Подключите Telegram или VK — диалоги клиентов появятся здесь."
              href="/connections"
              action="Открыть подключения"
            />
          ) : (
            <ul className="crm-list">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    disabled={busy || uploading}
                    aria-pressed={selected === c.id}
                    onClick={() => {
                      setSelected(c.id);
                      setMessagePage(0);
                      setMessages([]);
                      setText("");
                      setFiles([]);
                      requestKey.current = "";
                    }}
                  >
                    <strong>
                      {c.clientName || c.externalUsername || c.externalUserId} ·{" "}
                      {c.platform}
                    </strong>
                    <span>{c.lastMessage.slice(0, 100)}</span>
                    <small>
                      {new Date(c.lastMessageAt).toLocaleString("ru", {
                        timeZone: timezone,
                      })}
                      {c.unread > 0 ? " · Новых: " + c.unread : ""}
                    </small>
                    {c.assignedName && (
                      <small>В работе · {c.assignedName}</small>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel crm-panel">
          {!selected ? (
            <p>Выберите диалог.</p>
          ) : (
            <>
              <h2>
                {current?.clientName ||
                  current?.externalUsername ||
                  current?.externalUserId ||
                  "Диалог"}
              </h2>
              {current?.clientId ? (
                <p>
                  <Link href="/clients">Карточка клиента</Link>
                </p>
              ) : null}
              <div className="message-actions">
                <button
                  className="button button--primary"
                  disabled={busy}
                  onClick={() => void status("assigned")}
                >
                  Взять в работу
                </button>
                <button
                  className="button button--outline"
                  disabled={busy}
                  onClick={() => void status("closed")}
                >
                  Закрыть диалог
                </button>
              </div>
              <nav aria-label="История переписки">
                <button
                  disabled={messages.length < 500}
                  onClick={() => setMessagePage(messagePage + 1)}
                >
                  Раньше
                </button>
                <span> {messagePage + 1} </span>
                <button
                  disabled={!messagePage}
                  onClick={() => setMessagePage(messagePage - 1)}
                >
                  Позже
                </button>
              </nav>
              <div className="message-history" aria-live="polite">
                {messages.map((m) => (
                  <article
                    className={"message-bubble message-bubble--" + m.direction}
                    key={m.id}
                  >
                    <p>{m.text}</p>
                    {m.attachments?.map((f) => (
                      <p key={f.id}>
                        <a
                          href={`/api/v1/businesses/${businessId}/attachments/${f.id}`}
                        >
                          {f.filename}
                        </a>
                      </p>
                    ))}
                    <small>
                      {new Date(m.createdAt).toLocaleString("ru", {
                        timeZone: timezone,
                      })}{" "}
                      {m.direction === "outbound" &&
                        (
                          {
                            queued: "В очереди",
                            sent: "Отправлено",
                            failed: "Ошибка отправки",
                            uncertain: "Доставка не подтверждена",
                          } as Record<string, string>
                        )[m.deliveryStatus]}
                    </small>
                  </article>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <label>
                  Ответ клиенту
                  <textarea
                    required={!files.length}
                    maxLength={4000}
                    value={text}
                    disabled={busy}
                    onChange={(e) => {
                      setText(e.target.value);
                      requestKey.current = "";
                    }}
                  />
                </label>
                <AttachmentPicker
                  businessId={businessId}
                  files={files}
                  onChange={(v) => {
                    setFiles(v);
                    requestKey.current = "";
                  }}
                  disabled={busy}
                  onBusy={setUploading}
                />
                <button
                  className="button button--primary"
                  disabled={
                    busy || uploading || (!text.trim() && !files.length)
                  }
                >
                  Отправить
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
