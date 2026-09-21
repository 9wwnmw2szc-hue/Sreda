"use client";
import {
  AttachmentPicker,
  type FileItem,
} from "@/components/attachments/AttachmentPicker";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import {
  EmptyStateCta,
  SolutionSetupBanner,
} from "@/components/solutions/SolutionSetupBanner";
import { Disclosure } from "@/components/ui/Disclosure";
import { Pagination } from "@/components/ui/Pagination";
type Target = { id: string; title: string; platform: string; active: boolean };
type Post = {
  attachments: FileItem[];
  id: string;
  text: string;
  text_telegram?: string | null;
  text_vk?: string | null;
  buttons: { text: string; url: string }[];
  status: string;
  revision: number;
  scheduled_at: string | null;
  deliveries: {
    target_id: string;
    title: string;
    platform: string;
    status: string;
    last_error: string | null;
  }[];
  schedule?: {
    active: boolean;
    rule: {
      frequency: string;
      start: string;
      time: string;
      end?: string;
      weekdays?: number[];
    };
  };
};
const statuses: Record<string, string> = {
  draft: "Черновик",
  scheduled: "Запланирован",
  publishing: "Отправляется",
  published: "Опубликован",
  partial: "Частично опубликован",
  failed: "Ошибка",
  cancelled: "Отменён",
  pending: "Ожидает",
  uncertain: "Доставка не подтверждена",
};
export function PostsView() {
  const { currentBusiness } = useBusinessContext();
  if (!currentBusiness) return <p>Выберите бизнес.</p>;
  if (currentBusiness.role === "operator")
    return <p>Публикациями управляет владелец или администратор.</p>;
  return (
    <Editor
      key={currentBusiness.id}
      businessId={currentBusiness.id}
      timezone={currentBusiness.timezone ?? "UTC"}
    />
  );
}
function Editor({
  businessId,
  timezone,
}: {
  businessId: string;
  timezone: string;
}) {
  const [files, setFiles] = useState<FileItem[]>([]),
    [uploading, setUploading] = useState(false);
  const base = `/api/v1/businesses/${businessId}`;
  const [posts, setPosts] = useState<Post[]>([]),
    [targets, setTargets] = useState<Target[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(0),
    [text, setText] = useState(""),
    [textTelegram, setTextTelegram] = useState(""),
    [textVk, setTextVk] = useState(""),
    [chosen, setChosen] = useState<string[]>([]),
    [buttons, setButtons] = useState<{ text: string; url: string }[]>([]),
    [editing, setEditing] = useState<Post | null>(null),
    [date, setDate] = useState(""),
    [time, setTime] = useState("12:00"),
    [frequency, setFrequency] = useState(""),
    [end, setEnd] = useState(""),
    [weekdays, setWeekdays] = useState<number[]>([1]),
    [prompt, setPrompt] = useState(""),
    [platform, setPlatform] = useState("telegram"),
    [channel, setChannel] = useState(""),
    [publishToken, setPublishToken] = useState(""),
    [confirm, setConfirm] = useState<{ post: Post; action: string } | null>(
      null,
    );
  const key = useRef("");
  const postsUrl = base + "/posts?filter=" + filter + "&page=" + page;
  async function refresh() {
    const [p, t] = await Promise.all([
      apiRequest<Post[]>(postsUrl),
      apiRequest<Target[]>(base + "/post-targets"),
    ]);
    setPosts(p);
    setTargets(t);
  }
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [p, t] = await Promise.all([
          apiRequest<Post[]>(postsUrl),
          apiRequest<Target[]>(base + "/post-targets"),
        ]);
        if (active) {
          setPosts(p);
          setTargets(t);
          setLoaded(true);
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : "Не удалось загрузить.");
          setLoaded(true);
        }
      }
    }
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [base, postsUrl]);
  function reset() {
    setEditing(null);
    setText("");
    setTextTelegram("");
    setTextVk("");
    setFiles([]);
    setChosen([]);
    setButtons([]);
    setFrequency("");
    setEnd("");
    setWeekdays([1]);
    setDate("");
    key.current = "";
  }
  async function save(action: string) {
    setBusy(true);
    setError("");
    key.current ||= crypto.randomUUID();
    try {
      await apiRequest(base + "/posts" + (editing ? "/" + editing.id : ""), {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          text,
          text_telegram: textTelegram || null,
          text_vk: textVk || null,
          attachments: files.map((f) => f.id),
          targets: chosen,
          buttons,
          action,
          request_key: key.current,
          revision: editing?.revision,
          date,
          time,
          ...(frequency && action === "schedule"
            ? {
                recurrence: {
                  frequency,
                  start: date,
                  time,
                  end: end || undefined,
                  weekdays,
                },
              }
            : {}),
        }),
      });
      reset();
      setNotice(
        action === "draft"
          ? "Черновик сохранён."
          : "Публикация поставлена в очередь.",
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }
  async function action(post: Post, value: string) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(base + "/posts/" + post.id, {
        method: "POST",
        body: JSON.stringify({ action: value }),
      });
      setConfirm(null);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function ai(action: string) {
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ text: string }>(base + "/posts/ai", {
        method: "POST",
        body: JSON.stringify({ prompt, text, action }),
      });
      setText(result.text);
      key.current = "";
      setNotice("AI подготовил черновик. Проверьте текст перед публикацией.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать текст.");
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const token = publishToken;
      setPublishToken("");
      await apiRequest(base + "/post-targets", {
        method: "POST",
        body: JSON.stringify({ platform, channel, publishToken: token }),
      });
      await refresh();
      setNotice("Площадка проверена и подключена.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось подключить площадку.",
      );
    } finally {
      setBusy(false);
    }
  }
  const calendarGroups = (() => {
    const groups = new Map<string, Post[]>();
    for (const post of posts) {
      if (
        !post.scheduled_at ||
        (post.status !== "scheduled" && !post.schedule?.active)
      )
        continue;
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(post.scheduled_at));
      const list = groups.get(key) ?? [];
      list.push(post);
      groups.set(key, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  })();
  return (
    <div>
      <h1>Автопостинг</h1>
      <p>
        Планирование в часовом поясе {timezone}. AI создаёт только черновики.
      </p>
      <SolutionSetupBanner code="autopost" />
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!targets.length && loaded ? (
        <EmptyStateCta
          title="Подключите площадку"
          description="Выберите Telegram или VK, затем создайте первую публикацию."
          href="#post-targets"
          action="К подключению площадок"
        />
      ) : null}
      {calendarGroups.length > 0 && (
        <section className="panel crm-panel posts-calendar" aria-label="Календарь">
          <h2>Календарь</h2>
          <p className="field-hint">Запланированные публикации по датам.</p>
          <ul className="posts-calendar-list">
            {calendarGroups.map(([day, dayPosts]) => (
              <li key={day}>
                <strong>
                  {new Date(day + "T12:00:00").toLocaleDateString("ru", {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                  })}
                </strong>
                <ul>
                  {dayPosts.map((p) => (
                    <li key={p.id}>
                      <span>
                        {new Date(p.scheduled_at!).toLocaleTimeString("ru", {
                          timeZone: timezone,
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>{" "}
                      {p.text.slice(0, 80)}
                      {p.text.length > 80 ? "…" : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="crm-columns">
        <section className="panel crm-panel">
          <h2 id="new-post">{editing ? "Редактировать публикацию" : "Создать публикацию"}</h2>
          {targets
            .filter((t) => t.active)
            .map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={chosen.includes(t.id)}
                  onChange={(e) => {
                    setChosen(
                      e.target.checked
                        ? [...chosen, t.id]
                        : chosen.filter((x) => x !== t.id),
                    );
                    key.current = "";
                  }}
                />
                {t.platform} · {t.title}
              </label>
            ))}
          {loaded && !targets.length && <p>Подключите площадку ниже.</p>}
          <label>
            Текст
            <textarea
              maxLength={4096}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                key.current = "";
              }}
            />
          </label>
          <Disclosure title="Текст для площадок" hint="Необязательно">
            <label>
              Telegram
              <textarea
                maxLength={4096}
                value={textTelegram}
                onChange={(e) => {
                  setTextTelegram(e.target.value);
                  key.current = "";
                }}
              />
            </label>
            <label>
              ВКонтакте
              <textarea
                maxLength={4096}
                value={textVk}
                onChange={(e) => {
                  setTextVk(e.target.value);
                  key.current = "";
                }}
              />
            </label>
          </Disclosure>
          <AttachmentPicker
            businessId={businessId}
            files={files}
            onChange={(v) => {
              setFiles(v);
              key.current = "";
            }}
            mediaOnly
            disabled={busy}
            onBusy={setUploading}
          />
          <Disclosure title="Создать с AI">
            <label>
              Задание
              <textarea
                value={prompt}
                maxLength={4000}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
            <div className="message-actions">
              {Object.entries({
                generate: "Создать",
                rewrite: "Переписать",
                shorten: "Сократить",
                expand: "Расширить",
                selling: "Более продающий",
                formal: "Официальнее",
                friendly: "Дружелюбнее",
                correct: "Исправить ошибки",
                add_emoji: "Добавить эмодзи",
                remove_emoji: "Убрать эмодзи",
                variant: "Другой вариант",
              }).map(([v, l]) => (
                <button key={v} disabled={busy} onClick={() => void ai(v)}>
                  {l}
                </button>
              ))}
            </div>
          </Disclosure>
          <h3>Кнопки</h3>
          <p>В VK кнопки публикуются как ссылки в тексте.</p>
          {buttons.map((b, i) => (
            <div key={i}>
              <label>
                Название
                <input
                  value={b.text}
                  maxLength={50}
                  onChange={(e) => {
                    setButtons(
                      buttons.map((x, j) =>
                        j === i ? { ...x, text: e.target.value } : x,
                      ),
                    );
                    key.current = "";
                  }}
                />
              </label>
              <label>
                HTTPS-ссылка
                <input
                  type="url"
                  value={b.url}
                  onChange={(e) => {
                    setButtons(
                      buttons.map((x, j) =>
                        j === i ? { ...x, url: e.target.value } : x,
                      ),
                    );
                    key.current = "";
                  }}
                />
              </label>
              <button
                onClick={() => {
                  setButtons(buttons.filter((_, j) => j !== i));
                  key.current = "";
                }}
              >
                Убрать кнопку
              </button>
            </div>
          ))}
          <button
            disabled={buttons.length >= 10}
            onClick={() => {
              setButtons([...buttons, { text: "", url: "" }]);
              key.current = "";
            }}
          >
            Добавить кнопку
          </button>
          <label>
            Дата
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                key.current = "";
              }}
            />
          </label>
          <label>
            Время
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                key.current = "";
              }}
            />
          </label>
          <label>
            Повторение
            <select
              value={frequency}
              onChange={(e) => {
                setFrequency(e.target.value);
                key.current = "";
              }}
            >
              {[
                ["", "Без повторения"],
                ["daily", "Ежедневно"],
                ["weekdays", "Выбранные дни"],
                ["weekly", "Еженедельно"],
                ["monthly", "Ежемесячно"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {frequency === "weekdays" &&
            ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"].map((d, i) => (
              <label key={i}>
                <input
                  type="checkbox"
                  checked={weekdays.includes(i)}
                  onChange={(e) => {
                    setWeekdays(
                      e.target.checked
                        ? [...weekdays, i]
                        : weekdays.filter((x) => x !== i),
                    );
                    key.current = "";
                  }}
                />
                {d}
              </label>
            ))}
          {frequency && (
            <label>
              Окончание повторений
              <input
                type="date"
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  key.current = "";
                }}
              />
            </label>
          )}
          <div className="message-actions">
            <button
              className="button button--outline"
              disabled={busy || uploading}
              onClick={() => void save("draft")}
            >
              Сохранить черновик
            </button>
            <button
              className="button button--primary"
              disabled={busy || uploading}
              onClick={() => void save("schedule")}
            >
              Запланировать
            </button>
            <button
              className="button button--primary"
              disabled={busy || uploading}
              onClick={() => void save("now")}
            >
              Опубликовать сейчас
            </button>
            {editing && (
              <button onClick={reset}>Закончить редактирование</button>
            )}
          </div>
          <Disclosure title="Подключить площадку">
            <div id="post-targets">
            <label>
              Платформа
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="telegram">Telegram</option>
                <option value="vk">VK</option>
              </select>
            </label>
            {platform === "telegram" ? (
              <label>
                Канал @username или ID
                <input
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                />
              </label>
            ) : (
              <label>
                Пользовательский ключ VK для публикации
                <input
                  type="password"
                  autoComplete="off"
                  value={publishToken}
                  onChange={(e) => setPublishToken(e.target.value)}
                />
              </label>
            )}
            <button disabled={busy} onClick={() => void connect()}>
              Проверить и подключить
            </button>
            </div>
          </Disclosure>
        </section>
        <section className="panel crm-panel">
          <h2>История публикаций</h2>
          <Pagination
            page={page}
            hasNext={posts.length >= 100}
            busy={busy}
            onPage={setPage}
          />
          <label>
            Фильтр
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
            >
              {Object.entries({
                all: "Все",
                draft: "Черновики",
                scheduled: "Запланированные",
                published: "Опубликованные",
                failed: "Ошибки",
              }).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {!loaded ? (
            <p>Загрузка…</p>
          ) : !posts.length ? (
            <EmptyStateCta
              title="Публикаций пока нет"
              description="Создайте текст, выберите площадки и опубликуйте сейчас или по расписанию."
              href="#new-post"
              action="Создать публикацию"
            />
          ) : (
            posts
              .filter(
                (p) =>
                  filter === "all" ||
                  p.status === filter ||
                  (filter === "failed" && p.status === "partial") ||
                  (filter === "scheduled" && p.schedule?.active),
              )
              .map((p) => (
                <article className="message-bubble" key={p.id}>
                  <p>{p.text}</p>
                  {p.attachments?.map((f) => (
                    <p key={f.id}>
                      <a href={`${base}/attachments/${f.id}`}>{f.filename}</a>
                    </p>
                  ))}
                  <strong>
                    {p.schedule?.active ? "Повторяющаяся" : statuses[p.status]}
                  </strong>
                  {p.scheduled_at && (
                    <p>
                      {new Date(p.scheduled_at).toLocaleString("ru", {
                        timeZone: timezone,
                      })}
                    </p>
                  )}
                  {p.deliveries.map((d) => (
                    <p key={d.target_id}>
                      {d.platform} · {d.title}: {statuses[d.status]}{" "}
                      {d.last_error ? "· " + d.last_error : ""}
                    </p>
                  ))}
                  <div className="message-actions">
                    {["draft", "scheduled"].includes(p.status) && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setEditing(p);
                          setText(p.text);
                          setTextTelegram(p.text_telegram ?? "");
                          setTextVk(p.text_vk ?? "");
                          setFiles(p.attachments ?? []);
                          setChosen(p.deliveries.map((d) => d.target_id));
                          setButtons(p.buttons);
                          setFrequency(p.schedule?.rule.frequency ?? "");
                          const local = p.scheduled_at
                            ? Object.fromEntries(
                                new Intl.DateTimeFormat("en-CA", {
                                  timeZone: timezone,
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hourCycle: "h23",
                                })
                                  .formatToParts(new Date(p.scheduled_at))
                                  .map((v) => [v.type, v.value]),
                              )
                            : null;
                          setDate(
                            p.schedule?.rule.start ??
                              (local
                                ? `${local.year}-${local.month}-${local.day}`
                                : ""),
                          );
                          setTime(
                            p.schedule?.rule.time ??
                              (local
                                ? `${local.hour}:${local.minute}`
                                : "12:00"),
                          );
                          setEnd(p.schedule?.rule.end ?? "");
                          setWeekdays(p.schedule?.rule.weekdays ?? [1]);
                          key.current = "";
                        }}
                      >
                        Редактировать
                      </button>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => void action(p, "duplicate")}
                    >
                      Дублировать
                    </button>
                    {p.status === "draft" && (
                      <button
                        disabled={busy}
                        onClick={() => void action(p, "now")}
                      >
                        Опубликовать сейчас
                      </button>
                    )}
                    {["failed", "partial"].includes(p.status) && (
                      <button
                        disabled={busy}
                        onClick={() => void action(p, "retry")}
                      >
                        Повторить после ошибки
                      </button>
                    )}
                    {["draft", "scheduled"].includes(p.status) && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          setConfirm({ post: p, action: "cancel" })
                        }
                      >
                        Отменить публикацию
                      </button>
                    )}
                    {["draft", "scheduled", "cancelled"].includes(p.status) && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          setConfirm({ post: p, action: "delete" })
                        }
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </article>
              ))
          )}
        </section>
      </div>
      {confirm && (
        <section
          className="panel crm-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Отмена публикации"
        >
          <p>
            {confirm.action === "delete"
              ? "Удалить публикацию из списка и отменить её будущие повторения?"
              : "Отменить публикацию и её будущие повторения?"}
          </p>
          <button
            disabled={busy}
            onClick={() => void action(confirm.post, confirm.action)}
          >
            {confirm.action === "delete" ? "Удалить" : "Да, отменить"}
          </button>
          <button onClick={() => setConfirm(null)}>Назад</button>
        </section>
      )}
    </div>
  );
}
