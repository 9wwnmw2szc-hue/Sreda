"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { DetailDialog } from "@/components/dashboard/DetailDialog";
import { apiRequest } from "@/lib/apiClient";
import { useBusinessContext } from "@/hooks/useBusinessContext";

type Mode = "day" | "week" | "month";
type KindFilter = "all" | "bookings" | "events";

type Specialist = { id: string; name: string; active: boolean };

type CalendarItem = {
  kind: "event" | "booking";
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  status?: string;
  event_type?: string;
  all_day?: boolean;
  specialist_id?: string | null;
  specialist_name?: string;
  client_id?: string;
  client_name?: string;
  service_name?: string;
  assigned_to?: string | null;
  description?: string;
};

const EVENT_TYPES = [
  { value: "note", label: "Заметка" },
  { value: "task", label: "Задача" },
  { value: "meeting", label: "Встреча" },
  { value: "reminder", label: "Напоминание" },
  { value: "blocked_time", label: "Блокировка" },
  { value: "other", label: "Другое" },
] as const;

const REMINDER_OFFSETS = [
  { value: 0, label: "В момент" },
  { value: 5, label: "За 5 мин" },
  { value: 15, label: "За 15 мин" },
  { value: 30, label: "За 30 мин" },
  { value: 60, label: "За 1 ч" },
  { value: 120, label: "За 2 ч" },
  { value: 1440, label: "За сутки" },
] as const;

const BOOKING_STATUS: Record<string, string> = {
  confirmed: "Подтверждена",
  pending: "Ожидает",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Не пришёл",
};

const EVENT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  EVENT_TYPES.map((t) => [t.value, t.label]),
);

function dateKey(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function startOfLocalDay(isoDate: string) {
  return new Date(isoDate + "T00:00:00");
}

function addDays(isoDate: string, days: number) {
  const d = startOfLocalDay(isoDate);
  d.setDate(d.getDate() + days);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDayLabel(isoDate: string, tz: string) {
  return new Date(isoDate + "T12:00:00").toLocaleDateString("ru", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

function formatTime(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString("ru", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRange(item: CalendarItem, tz: string) {
  if (item.all_day) return "Весь день";
  const start = formatTime(item.starts_at, tz);
  if (!item.ends_at) return start;
  return start + "–" + formatTime(item.ends_at, tz);
}

function weekDates(anchor: string) {
  const d = startOfLocalDay(anchor);
  const weekday = (d.getDay() + 6) % 7; // Mon=0
  const monday = addDays(anchor, -weekday);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function monthGrid(anchor: string) {
  const [y, m] = anchor.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const firstWeekday = (startOfLocalDay(first).getDay() + 6) % 7;
  const start = addDays(first, -firstWeekday);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function initialMode(): Mode {
  if (typeof window === "undefined") return "week";
  return window.matchMedia("(max-width: 767px)").matches ? "day" : "week";
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}

export function CalendarView() {
  const { currentBusiness } = useBusinessContext();
  return currentBusiness ? (
    <CalendarPanel
      key={currentBusiness.id}
      businessId={currentBusiness.id}
      timezone={currentBusiness.timezone ?? "UTC"}
    />
  ) : (
    <p>Выберите бизнес.</p>
  );
}

function CalendarPanel({
  businessId,
  timezone,
}: {
  businessId: string;
  timezone: string;
}) {
  const base = `/api/v1/businesses/${businessId}`;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [anchor, setAnchor] = useState(() => dateKey(new Date(), timezone));
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [selectedSpecialists, setSelectedSpecialists] = useState<string[]>([]);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [creating, setCreating] = useState<{
    starts: string;
    ends: string;
  } | null>(null);

  const range = useMemo(() => {
    if (mode === "day") {
      const from = startOfLocalDay(anchor);
      const to = startOfLocalDay(addDays(anchor, 1));
      return { from: from.toISOString(), to: to.toISOString() };
    }
    if (mode === "week") {
      const days = weekDates(anchor);
      const from = startOfLocalDay(days[0]!);
      const to = startOfLocalDay(addDays(days[6]!, 1));
      return { from: from.toISOString(), to: to.toISOString() };
    }
    const days = monthGrid(anchor);
    const from = startOfLocalDay(days[0]!);
    const to = startOfLocalDay(addDays(days[41]!, 1));
    return { from: from.toISOString(), to: to.toISOString() };
  }, [mode, anchor]);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void apiRequest<{ specialists: Specialist[] }>(base + "/booking-config")
        .then((catalog) => {
          if (alive) setSpecialists(catalog.specialists ?? []);
        })
        .catch(() => {
          if (alive) setSpecialists([]);
        });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [base]);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({
        from: range.from,
        to: range.to,
        includeBookings: kindFilter === "events" ? "0" : "1",
      });
      if (onlyMine) params.set("onlyMine", "1");
      for (const id of selectedSpecialists) params.append("specialist", id);
      for (const t of typeFilter) params.append("type", t);
      void apiRequest<CalendarItem[]>(base + "/calendar?" + params.toString())
        .then((rows) => {
          if (!alive) return;
          let next = rows;
          if (kindFilter === "bookings")
            next = rows.filter((r) => r.kind === "booking");
          else if (kindFilter === "events")
            next = rows.filter((r) => r.kind === "event");
          setItems(next);
          setError("");
        })
        .catch((e) => {
          if (alive)
            setError(e instanceof Error ? e.message : "Не удалось загрузить.");
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [
    base,
    range.from,
    range.to,
    kindFilter,
    onlyMine,
    selectedSpecialists,
    typeFilter,
  ]);

  async function refresh() {
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      includeBookings: kindFilter === "events" ? "0" : "1",
    });
    if (onlyMine) params.set("onlyMine", "1");
    for (const id of selectedSpecialists) params.append("specialist", id);
    for (const t of typeFilter) params.append("type", t);
    const rows = await apiRequest<CalendarItem[]>(
      base + "/calendar?" + params.toString(),
    );
    let next = rows;
    if (kindFilter === "bookings")
      next = rows.filter((r) => r.kind === "booking");
    else if (kindFilter === "events")
      next = rows.filter((r) => r.kind === "event");
    setItems(next);
  }

  function openCreate(at?: Date) {
    const start = at ?? new Date();
    const end = new Date(+start + 60 * 60000);
    setCreating({
      starts: toLocalInput(start.toISOString()),
      ends: toLocalInput(end.toISOString()),
    });
    setSelected(null);
  }

  async function saveEvent(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(base + "/calendar", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCreating(null);
      setNotice("Событие создано.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelEvent(id: string) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(base + "/calendar/" + id, { method: "DELETE" });
      setSelected(null);
      setNotice("Событие отменено.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отменить.");
    } finally {
      setBusy(false);
    }
  }

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = dateKey(new Date(item.starts_at), timezone);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    for (const list of map.values())
      list.sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    return map;
  }, [items, timezone]);

  const singleSpecialist =
    selectedSpecialists.length === 1 ? selectedSpecialists[0]! : null;

  function step(delta: number) {
    if (mode === "day") setAnchor(addDays(anchor, delta));
    else if (mode === "week") setAnchor(addDays(anchor, delta * 7));
    else {
      const [y, m] = anchor.split("-").map(Number);
      const next = new Date(y!, m! - 1 + delta, 1);
      setAnchor(
        [
          next.getFullYear(),
          String(next.getMonth() + 1).padStart(2, "0"),
          "01",
        ].join("-"),
      );
    }
  }

  function toggleSpecialist(id: string) {
    setSelectedSpecialists((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleType(value: string) {
    setTypeFilter((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  }

  return (
    <div className="crm-page calendar-page">
      <header>
        <h1>Календарь</h1>
        <p>Записи и события в часовом поясе {timezone}.</p>
      </header>

      <section className="panel crm-panel">
        <nav aria-label="Режим календаря" className="calendar-toolbar">
          {(
            [
              ["day", "День"],
              ["week", "Неделя"],
              ["month", "Месяц"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                mode === value ? "button button--primary" : "button button--outline"
              }
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="button button--outline"
            onClick={() => step(-1)}
            aria-label="Назад"
          >
            ←
          </button>
          <strong className="calendar-anchor-label">
            {mode === "month"
              ? new Date(anchor + "T12:00:00").toLocaleDateString("ru", {
                  month: "long",
                  year: "numeric",
                })
              : mode === "week"
                ? formatDayLabel(weekDates(anchor)[0]!, timezone) +
                  " — " +
                  formatDayLabel(weekDates(anchor)[6]!, timezone)
                : formatDayLabel(anchor, timezone)}
          </strong>
          <button
            type="button"
            className="button button--outline"
            onClick={() => step(1)}
            aria-label="Вперёд"
          >
            →
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => openCreate()}
          >
            Событие
          </button>
        </nav>

        <div className="calendar-filters">
          <fieldset>
            <legend>Показать</legend>
            {(
              [
                ["all", "Все типы"],
                ["bookings", "Только записи"],
                ["events", "Только события"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="calendar-chip">
                <input
                  type="radio"
                  name="kind"
                  checked={kindFilter === value}
                  onChange={() => setKindFilter(value)}
                />
                {label}
              </label>
            ))}
            <label className="calendar-chip">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
              />
              Только мои
            </label>
          </fieldset>

          {specialists.length > 0 && (
            <fieldset>
              <legend>Специалисты</legend>
              {specialists.map((s) => (
                <label key={s.id} className="calendar-chip">
                  <input
                    type="checkbox"
                    checked={selectedSpecialists.includes(s.id)}
                    onChange={() => toggleSpecialist(s.id)}
                  />
                  {s.name}
                </label>
              ))}
            </fieldset>
          )}

          {kindFilter !== "bookings" && (
            <fieldset>
              <legend>Типы событий</legend>
              <button
                type="button"
                className="button button--outline"
                onClick={() => setTypeFilter([])}
              >
                Все типы
              </button>
              {EVENT_TYPES.map((t) => (
                <label key={t.value} className="calendar-chip">
                  <input
                    type="checkbox"
                    checked={typeFilter.includes(t.value)}
                    onChange={() => toggleType(t.value)}
                  />
                  {t.label}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="account-notice">
          {notice}
        </p>
      )}

      {loading ? (
        <p>Загрузка…</p>
      ) : mode === "day" ? (
        <DayView
          date={anchor}
          items={byDay.get(anchor) ?? []}
          timezone={timezone}
          onSelect={setSelected}
          onEmptySlot={() =>
            openCreate(new Date(anchor + "T09:00:00"))
          }
        />
      ) : mode === "week" ? (
        <WeekView
          days={weekDates(anchor)}
          byDay={byDay}
          timezone={timezone}
          specialists={
            singleSpecialist
              ? specialists.filter((s) => s.id === singleSpecialist)
              : []
          }
          singleSpecialist={singleSpecialist}
          onSelect={setSelected}
          onEmptyDay={(day) => openCreate(new Date(day + "T09:00:00"))}
        />
      ) : (
        <MonthView
          days={monthGrid(anchor)}
          anchorMonth={anchor.slice(0, 7)}
          byDay={byDay}
          timezone={timezone}
          onPickDay={(day) => {
            setAnchor(day);
            setMode("day");
          }}
        />
      )}

      {selected && (
        <DetailDialog
          title={
            selected.kind === "booking"
              ? selected.service_name ?? selected.title
              : selected.title
          }
          onClose={() => setSelected(null)}
        >
          {selected.kind === "booking" ? (
            <BookingDetail item={selected} timezone={timezone} />
          ) : (
            <EventDetail
              item={selected}
              timezone={timezone}
              busy={busy}
              onCancel={() => void cancelEvent(selected.id)}
            />
          )}
        </DetailDialog>
      )}

      {creating && (
        <DetailDialog title="Новое событие" onClose={() => setCreating(null)}>
          <EventForm
            initialStarts={creating.starts}
            initialEnds={creating.ends}
            specialists={specialists}
            busy={busy}
            onSubmit={(body) => void saveEvent(body)}
          />
        </DetailDialog>
      )}
    </div>
  );
}

function DayView({
  date,
  items,
  timezone,
  onSelect,
  onEmptySlot,
}: {
  date: string;
  items: CalendarItem[];
  timezone: string;
  onSelect: (item: CalendarItem) => void;
  onEmptySlot: () => void;
}) {
  return (
    <section className="panel crm-panel calendar-day" aria-label="День">
      <h2>{formatDayLabel(date, timezone)}</h2>
      {items.length === 0 ? (
        <button
          type="button"
          className="calendar-empty-slot"
          onClick={onEmptySlot}
        >
          Нет событий — нажмите, чтобы создать
        </button>
      ) : (
        <ul className="crm-list calendar-item-list">
          {items.map((item) => (
            <li key={item.kind + item.id}>
              <ItemCard item={item} timezone={timezone} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WeekView({
  days,
  byDay,
  timezone,
  specialists,
  singleSpecialist,
  onSelect,
  onEmptyDay,
}: {
  days: string[];
  byDay: Map<string, CalendarItem[]>;
  timezone: string;
  specialists: Specialist[];
  singleSpecialist: string | null;
  onSelect: (item: CalendarItem) => void;
  onEmptyDay: (day: string) => void;
}) {
  if (singleSpecialist && specialists.length === 1) {
    return (
      <section
        className="panel crm-panel calendar-week calendar-week--specialist"
        aria-label="Неделя"
      >
        <p>
          Колонки по дням · {specialists[0]!.name}
        </p>
        <div className="calendar-week-grid">
          {days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              items={(byDay.get(day) ?? []).filter(
                (i) => i.specialist_id === singleSpecialist || !i.specialist_id,
              )}
              timezone={timezone}
              onSelect={onSelect}
              onEmpty={() => onEmptyDay(day)}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="panel crm-panel calendar-week" aria-label="Неделя">
      <div className="calendar-week-grid">
        {days.map((day) => (
          <DayColumn
            key={day}
            day={day}
            items={byDay.get(day) ?? []}
            timezone={timezone}
            onSelect={onSelect}
            onEmpty={() => onEmptyDay(day)}
          />
        ))}
      </div>
    </section>
  );
}

function DayColumn({
  day,
  items,
  timezone,
  onSelect,
  onEmpty,
}: {
  day: string;
  items: CalendarItem[];
  timezone: string;
  onSelect: (item: CalendarItem) => void;
  onEmpty: () => void;
}) {
  return (
    <div className="calendar-week-col">
      <h3>{formatDayLabel(day, timezone)}</h3>
      {items.length === 0 ? (
        <button type="button" className="calendar-empty-slot" onClick={onEmpty}>
          Свободно
        </button>
      ) : (
        items.map((item) => (
          <ItemCard
            key={item.kind + item.id}
            item={item}
            timezone={timezone}
            onSelect={onSelect}
            compact
          />
        ))
      )}
    </div>
  );
}

function MonthView({
  days,
  anchorMonth,
  byDay,
  timezone,
  onPickDay,
}: {
  days: string[];
  anchorMonth: string;
  byDay: Map<string, CalendarItem[]>;
  timezone: string;
  onPickDay: (day: string) => void;
}) {
  return (
    <section className="panel crm-panel calendar-month" aria-label="Месяц">
      <div className="calendar-month-head" aria-hidden>
        {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="calendar-month-grid">
        {days.map((day) => {
          const count = byDay.get(day)?.length ?? 0;
          const inMonth = day.startsWith(anchorMonth);
          return (
            <button
              key={day}
              type="button"
              className={
                "calendar-month-cell" +
                (inMonth ? "" : " calendar-month-cell--muted")
              }
              aria-label={
                formatDayLabel(day, timezone) +
                (count ? `, ${count}` : "")
              }
              onClick={() => onPickDay(day)}
            >
              <span className="calendar-month-day">
                {Number(day.slice(-2))}
              </span>
              {count > 0 && (
                <span className="calendar-month-count">
                  {count > 3 ? (
                    <span className="calendar-month-badge">{count}</span>
                  ) : (
                    Array.from({ length: count }, (_, i) => (
                      <span key={i} className="calendar-month-dot" />
                    ))
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ItemCard({
  item,
  timezone,
  onSelect,
  compact,
}: {
  item: CalendarItem;
  timezone: string;
  onSelect: (item: CalendarItem) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={
        "calendar-item calendar-item--" +
        item.kind +
        (compact ? " calendar-item--compact" : "")
      }
      onClick={() => onSelect(item)}
    >
      <strong>{formatRange(item, timezone)}</strong>
      {item.kind === "booking" ? (
        <>
          <span>{item.client_name}</span>
          {!compact && <span>{item.service_name}</span>}
          {!compact && <span>{item.specialist_name}</span>}
          <span className="calendar-item-meta">
            {BOOKING_STATUS[item.status ?? ""] ?? item.status}
          </span>
        </>
      ) : (
        <>
          <span>{item.title}</span>
          <span className="calendar-item-meta">
            {EVENT_TYPE_LABEL[item.event_type ?? ""] ?? item.event_type}
          </span>
        </>
      )}
    </button>
  );
}

function BookingDetail({
  item,
  timezone,
}: {
  item: CalendarItem;
  timezone: string;
}) {
  return (
    <div className="calendar-detail">
      <p>{formatRange(item, timezone)}</p>
      <p>Клиент: {item.client_name}</p>
      <p>Услуга: {item.service_name}</p>
      <p>Специалист: {item.specialist_name}</p>
      <p>Статус: {BOOKING_STATUS[item.status ?? ""] ?? item.status}</p>
      <div className="message-actions">
        {item.client_id && (
          <Link className="button button--outline" href={"/clients?id=" + item.client_id}>
            Клиент
          </Link>
        )}
        <Link className="button button--outline" href="/messages">
          Сообщения
        </Link>
        <Link className="button button--outline" href={"/bookings?id=" + item.id}>
          Запись
        </Link>
      </div>
    </div>
  );
}

function EventDetail({
  item,
  timezone,
  busy,
  onCancel,
}: {
  item: CalendarItem;
  timezone: string;
  busy: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="calendar-detail">
      <p>
        {EVENT_TYPE_LABEL[item.event_type ?? ""] ?? item.event_type} ·{" "}
        {formatRange(item, timezone)}
      </p>
      {item.description && <p>{item.description}</p>}
      {item.status && <p>Статус: {item.status}</p>}
      {item.status !== "cancelled" && (
        <button
          type="button"
          className="button button--outline"
          disabled={busy}
          onClick={onCancel}
        >
          Отменить событие
        </button>
      )}
    </div>
  );
}

function EventForm({
  initialStarts,
  initialEnds,
  specialists,
  busy,
  onSubmit,
}: {
  initialStarts: string;
  initialEnds: string;
  specialists: Specialist[];
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("note");
  const [starts, setStarts] = useState(initialStarts);
  const [ends, setEnds] = useState(initialEnds);
  const [allDay, setAllDay] = useState(false);
  const [specialistId, setSpecialistId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [offsets, setOffsets] = useState<number[]>([]);
  const [relatedClient, setRelatedClient] = useState("");
  const [relatedLead, setRelatedLead] = useState("");
  const [relatedOrder, setRelatedOrder] = useState("");
  const [relatedBooking, setRelatedBooking] = useState("");

  function toggleOffset(value: number) {
    setOffsets((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      title,
      event_type: eventType,
      starts_at: new Date(starts).toISOString(),
      ends_at: ends ? new Date(ends).toISOString() : null,
      all_day: allDay,
    };
    if (specialistId) body.specialist_id = specialistId;
    if (assignedTo.trim()) body.assigned_to = assignedTo.trim();
    if (offsets.length) body.reminder_offsets = offsets;
    if (relatedClient.trim()) body.related_client_id = relatedClient.trim();
    if (relatedLead.trim()) body.related_lead_id = relatedLead.trim();
    if (relatedOrder.trim()) body.related_order_id = relatedOrder.trim();
    if (relatedBooking.trim()) body.related_booking_id = relatedBooking.trim();
    onSubmit(body);
  }

  return (
    <form className="calendar-event-form" onSubmit={handleSubmit}>
      <label>
        Название
        <input
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Тип
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        >
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Начало
        <input
          type="datetime-local"
          required
          value={starts}
          onChange={(e) => setStarts(e.target.value)}
        />
      </label>
      <label>
        Окончание
        <input
          type="datetime-local"
          value={ends}
          onChange={(e) => setEnds(e.target.value)}
          required={eventType === "blocked_time"}
        />
      </label>
      <label className="calendar-chip">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
        />
        Весь день
      </label>
      {specialists.length > 0 && (
        <label>
          Специалист
          <select
            value={specialistId}
            onChange={(e) => setSpecialistId(e.target.value)}
          >
            <option value="">Не выбран</option>
            {specialists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Назначить (UUID пользователя, необязательно)
        <input
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          placeholder="uuid"
        />
      </label>
      <fieldset>
        <legend>Напоминания</legend>
        {REMINDER_OFFSETS.map((o) => (
          <label key={o.value} className="calendar-chip">
            <input
              type="checkbox"
              checked={offsets.includes(o.value)}
              onChange={() => toggleOffset(o.value)}
            />
            {o.label}
          </label>
        ))}
      </fieldset>
      <details>
        <summary>Связанные объекты (UUID)</summary>
        <label>
          Клиент
          <input
            value={relatedClient}
            onChange={(e) => setRelatedClient(e.target.value)}
          />
        </label>
        <label>
          Заявка
          <input
            value={relatedLead}
            onChange={(e) => setRelatedLead(e.target.value)}
          />
        </label>
        <label>
          Заказ
          <input
            value={relatedOrder}
            onChange={(e) => setRelatedOrder(e.target.value)}
          />
        </label>
        <label>
          Запись
          <input
            value={relatedBooking}
            onChange={(e) => setRelatedBooking(e.target.value)}
          />
        </label>
      </details>
      <button type="submit" className="button button--primary" disabled={busy}>
        Создать
      </button>
    </form>
  );
}
