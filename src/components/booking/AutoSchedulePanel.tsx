"use client";
import { useMemo, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import {
  CustomerPreview,
  FieldHint,
  StickySaveBar,
} from "@/components/ui/SetupChrome";
import { FIELD_HINTS, WEEKDAY_LABELS, WEEKDAY_ORDER } from "@/lib/setupUx";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

type Interval = { start: number; end: number };
type DayState = {
  enabled: boolean;
  start: string;
  end: string;
  breaks: { start: string; end: string }[];
};

function toMinutes(hhmm: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function fromMinutes(n: number) {
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dayToIntervals(day: DayState): Interval[] {
  if (!day.enabled) return [];
  const start = toMinutes(day.start);
  const end = toMinutes(day.end);
  if (start == null || end == null || start >= end) return [];
  const breaks = day.breaks
    .map((b) => ({ start: toMinutes(b.start), end: toMinutes(b.end) }))
    .filter(
      (b): b is { start: number; end: number } =>
        b.start != null && b.end != null && b.start < b.end,
    )
    .sort((a, b) => a.start - b.start);
  const open: Interval[] = [];
  let cursor = start;
  for (const br of breaks) {
    if (br.end <= cursor || br.start >= end) continue;
    const a = Math.max(cursor, br.start);
    const b = Math.min(end, br.end);
    if (cursor < a) open.push({ start: cursor, end: a });
    cursor = Math.max(cursor, b);
  }
  if (cursor < end) open.push({ start: cursor, end });
  return open;
}

function emptyWeek(): Record<number, DayState> {
  const week: Record<number, DayState> = {};
  for (const d of WEEKDAY_ORDER) {
    week[d] = {
      enabled: d >= 1 && d <= 5,
      start: "09:00",
      end: "18:00",
      breaks: d >= 1 && d <= 5 ? [{ start: "13:00", end: "14:00" }] : [],
    };
  }
  return week;
}

function weekFromSchedules(
  specialistId: string,
  schedules: { specialist_id: string; weekday: number; intervals: Interval[] }[],
): Record<number, DayState> {
  const next = emptyWeek();
  if (!specialistId) return next;
  for (const row of schedules.filter((s) => s.specialist_id === specialistId)) {
    const intervals = row.intervals ?? [];
    if (!intervals.length) {
      next[row.weekday] = {
        enabled: false,
        start: "09:00",
        end: "18:00",
        breaks: [],
      };
      continue;
    }
    const start = intervals[0]!.start;
    const end = intervals[intervals.length - 1]!.end;
    const breaks: { start: string; end: string }[] = [];
    for (let i = 0; i < intervals.length - 1; i++) {
      breaks.push({
        start: fromMinutes(intervals[i]!.end),
        end: fromMinutes(intervals[i + 1]!.start),
      });
    }
    next[row.weekday] = {
      enabled: true,
      start: fromMinutes(start),
      end: fromMinutes(end),
      breaks,
    };
  }
  return next;
}

export function AutoSchedulePanel({
  businessId,
  timezone,
  specialists,
  services,
  schedules,
  settings,
  onSaved,
}: {
  businessId: string;
  timezone: string;
  specialists: { id: string; name: string }[];
  services: { id: string; name: string; duration_minutes: number }[];
  schedules: { specialist_id: string; weekday: number; intervals: Interval[] }[];
  settings: {
    schedule_mode?: string;
    slot_interval?: number;
    minimum_booking_notice?: number;
    maximum_booking_horizon?: number;
  };
  onSaved: () => Promise<void>;
}) {
  const base = `/api/v1/businesses/${businessId}`;
  const [specialistId, setSpecialistId] = useState(specialists[0]?.id ?? "");
  const [mode, setMode] = useState<"automatic" | "manual">(
    settings.schedule_mode === "manual" ? "manual" : "automatic",
  );
  const serverWeek = useMemo(
    () => weekFromSchedules(specialistId, schedules),
    [specialistId, schedules],
  );
  const [draftWeek, setDraftWeek] = useState<Record<number, DayState> | null>(
    null,
  );
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const week =
    draftWeek && draftFor === specialistId ? draftWeek : serverWeek;
  const setWeek = (
    updater:
      | Record<number, DayState>
      | ((prev: Record<number, DayState>) => Record<number, DayState>),
  ) => {
    setDraftFor(specialistId);
    setDraftWeek((prev) => {
      const base = prev && draftFor === specialistId ? prev : serverWeek;
      return typeof updater === "function" ? updater(base) : updater;
    });
  };
  const [slotInterval, setSlotInterval] = useState(
    settings.slot_interval ?? 30,
  );
  const [horizon, setHorizon] = useState(
    settings.maximum_booking_horizon ?? 30,
  );
  const [noticeMin, setNoticeMin] = useState(
    settings.minimum_booking_notice ?? 120,
  );
  const [bufferHint, setBufferHint] = useState(15);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [previewDate, setPreviewDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  const [previewService, setPreviewService] = useState(services[0]?.id ?? "");
  const [previewSlots, setPreviewSlots] = useState<string[]>([]);
  const [aiNotes, setAiNotes] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  useUnsavedChanges(dirty);

  const previewLines = useMemo(() => {
    if (!previewSlots.length)
      return ["На выбранную дату свободного времени пока нет."];
    return [
      `Дата: ${previewDate}`,
      ...previewSlots.slice(0, 12).map((iso) =>
        new Date(iso).toLocaleTimeString("ru", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
        }),
      ),
      previewSlots.length > 12 ? `… ещё ${previewSlots.length - 12}` : "",
    ].filter(Boolean);
  }, [previewSlots, previewDate, timezone]);

  async function save() {
    if (!specialistId) {
      setError("Сначала добавьте специалиста.");
      return;
    }
    setBusy(true);
    setError("");
    setSavedNotice("");
    try {
      await apiRequest(base + "/booking-config", {
        method: "POST",
        body: JSON.stringify({
          kind: "settings",
          schedule_mode: mode,
          slot_interval: slotInterval,
          maximum_booking_horizon: horizon,
          minimum_booking_notice: noticeMin,
        }),
      });
      if (mode === "automatic") {
        await apiRequest(base + "/booking-config", {
          method: "POST",
          body: JSON.stringify({
            kind: "schedule_bulk",
            specialist_id: specialistId,
            days: WEEKDAY_ORDER.map((weekday) => ({
              weekday,
              intervals: dayToIntervals(week[weekday]!),
            })),
          }),
        });
      }
      setDirty(false);
      setDraftWeek(null);
      setDraftFor(null);
      setSavedNotice("Расписание сохранено.");
      await onSaved();
      if (previewService && specialistId) await loadPreview();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось сохранить настройки. Попробуйте ещё раз.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadPreview() {
    if (!previewService || !specialistId) return;
    try {
      const slots = await apiRequest<string[]>(
        `${base}/booking-slots?service=${previewService}&specialist=${specialistId}&date=${previewDate}`,
      );
      setPreviewSlots(slots);
    } catch {
      setPreviewSlots([]);
    }
  }

  function applyWeekdays() {
    const src = week[1]!;
    setWeek((prev) => {
      const next = { ...prev };
      for (const d of [1, 2, 3, 4, 5]) next[d] = structuredClone(src);
      return next;
    });
    setDirty(true);
  }

  async function aiHelp() {
    setAiBusy(true);
    setError("");
    try {
      const result = await apiRequest<{
        proposal?: {
          weekdays?: {
            weekday: number;
            enabled: boolean;
            start: string;
            end: string;
            breaks?: { start: string; end: string }[];
          }[];
          buffer_minutes?: number;
          horizon_days?: number;
          slot_interval?: number;
          notice_minutes?: number;
        };
      }>(base + "/ai/interview", {
        method: "POST",
        body: JSON.stringify({
          action: "suggest_schedule",
          notes: aiNotes,
        }),
      });
      const p = result.proposal;
      if (!p?.weekdays?.length) {
        setError(
          "AI не смог предложить расписание. Заполните вручную или уточните описание.",
        );
        return;
      }
      setWeek((prev) => {
        const next = { ...prev };
        for (const day of p.weekdays!) {
          next[day.weekday] = {
            enabled: day.enabled !== false,
            start: day.start || "09:00",
            end: day.end || "18:00",
            breaks: day.breaks ?? [],
          };
        }
        return next;
      });
      if (p.slot_interval) setSlotInterval(p.slot_interval);
      if (p.horizon_days) setHorizon(p.horizon_days);
      if (p.notice_minutes != null) setNoticeMin(p.notice_minutes);
      if (p.buffer_minutes != null) setBufferHint(p.buffer_minutes);
      setDirty(true);
      setSavedNotice(
        "Черновик расписания от AI готов. Проверьте и нажмите «Сохранить расписание».",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "AI временно недоступен. Настройте расписание вручную.",
      );
    } finally {
      setAiBusy(false);
    }
  }

  if (!specialists.length) {
    return (
      <section className="panel crm-panel" id="auto-schedule">
        <h2>Автоматическое расписание</h2>
        <p>Сначала добавьте хотя бы одного специалиста в блоке выше.</p>
      </section>
    );
  }

  return (
    <section className="panel crm-panel auto-schedule" id="auto-schedule">
      <h2>Автоматическое расписание</h2>
      <p className="account-footnote">
        Основной способ: задайте рабочие дни и часы — слоты рассчитаются
        автоматически.
      </p>
      <FieldHint>{FIELD_HINTS.scheduleModeAuto}</FieldHint>

      <fieldset className="auto-schedule__mode">
        <legend>Как формировать расписание?</legend>
        <label>
          <input
            type="radio"
            checked={mode === "automatic"}
            onChange={() => {
              setMode("automatic");
              setDirty(true);
            }}
          />{" "}
          Автоматическое расписание (по умолчанию)
        </label>
        <label>
          <input
            type="radio"
            checked={mode === "manual"}
            onChange={() => {
              setMode("manual");
              setDirty(true);
            }}
          />{" "}
          Вручную (расширенный режим)
        </label>
        {mode === "manual" ? (
          <FieldHint>{FIELD_HINTS.scheduleModeManual}</FieldHint>
        ) : null}
      </fieldset>

      <label>
        Специалист
        <select
          value={specialistId}
          onChange={(e) => {
            setSpecialistId(e.target.value);
            setDraftWeek(null);
            setDraftFor(null);
            setDirty(false);
          }}
        >
          {specialists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {mode === "automatic" ? (
        <>
          <div className="auto-schedule__days schedule-grid">
            {WEEKDAY_ORDER.map((d) => {
              const day = week[d]!;
              return (
                <article key={d} className="day-card">
                  <header>
                    <strong>{WEEKDAY_LABELS[d]}</strong>
                    <label>
                      <input
                        type="checkbox"
                        checked={day.enabled}
                        onChange={(e) => {
                          setWeek((prev) => ({
                            ...prev,
                            [d]: { ...day, enabled: e.target.checked },
                          }));
                          setDirty(true);
                        }}
                      />{" "}
                      Рабочий день
                    </label>
                  </header>
                  {day.enabled ? (
                    <>
                      <div className="day-card__times">
                        <label>
                          С
                          <input
                            type="time"
                            value={day.start}
                            onChange={(e) => {
                              setWeek((prev) => ({
                                ...prev,
                                [d]: { ...day, start: e.target.value },
                              }));
                              setDirty(true);
                            }}
                          />
                        </label>
                        <label>
                          До
                          <input
                            type="time"
                            value={day.end}
                            onChange={(e) => {
                              setWeek((prev) => ({
                                ...prev,
                                [d]: { ...day, end: e.target.value },
                              }));
                              setDirty(true);
                            }}
                          />
                        </label>
                      </div>
                      {day.breaks.map((br, i) => (
                        <div className="day-card__break" key={i}>
                          <span>Перерыв</span>
                          <input
                            type="time"
                            value={br.start}
                            onChange={(e) => {
                              const breaks = day.breaks.map((x, j) =>
                                j === i ? { ...x, start: e.target.value } : x,
                              );
                              setWeek((prev) => ({
                                ...prev,
                                [d]: { ...day, breaks },
                              }));
                              setDirty(true);
                            }}
                          />
                          <input
                            type="time"
                            value={br.end}
                            onChange={(e) => {
                              const breaks = day.breaks.map((x, j) =>
                                j === i ? { ...x, end: e.target.value } : x,
                              );
                              setWeek((prev) => ({
                                ...prev,
                                [d]: { ...day, breaks },
                              }));
                              setDirty(true);
                            }}
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        className="button button--outline"
                        onClick={() => {
                          setWeek((prev) => ({
                            ...prev,
                            [d]: {
                              ...day,
                              breaks: [
                                ...day.breaks,
                                { start: "13:00", end: "14:00" },
                              ],
                            },
                          }));
                          setDirty(true);
                        }}
                      >
                        + Добавить перерыв
                      </button>
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>
          <button
            type="button"
            className="button button--outline"
            onClick={applyWeekdays}
          >
            Применить ко всем будням
          </button>

          <label>
            Как часто предлагать время клиенту?
            <select
              value={slotInterval}
              onChange={(e) => {
                setSlotInterval(Number(e.target.value));
                setDirty(true);
              }}
            >
              <option value={15}>Каждые 15 минут</option>
              <option value={30}>Каждые 30 минут</option>
              <option value={60}>Каждый час</option>
            </select>
          </label>
          <FieldHint>{FIELD_HINTS.slotInterval}</FieldHint>

          <label>
            Перерыв между клиентами (подсказка для услуг)
            <select
              value={bufferHint}
              onChange={(e) => setBufferHint(Number(e.target.value))}
            >
              {[0, 5, 10, 15, 30].map((n) => (
                <option key={n} value={n}>
                  {n} минут
                </option>
              ))}
            </select>
          </label>
          <FieldHint>
            {FIELD_HINTS.bufferAfter} Задайте это же значение в карточке услуги
            как «перерыв после записи».
          </FieldHint>

          <label>
            На сколько дней вперёд клиенты могут записываться?
            <select
              value={horizon}
              onChange={(e) => {
                setHorizon(Number(e.target.value));
                setDirty(true);
              }}
            >
              {[7, 14, 30, 60, 90].map((n) => (
                <option key={n} value={n}>
                  {n} дней
                </option>
              ))}
            </select>
          </label>
          <FieldHint>{FIELD_HINTS.bookingHorizon}</FieldHint>

          <label>
            За сколько времени до начала ещё можно записаться?
            <select
              value={noticeMin}
              onChange={(e) => {
                setNoticeMin(Number(e.target.value));
                setDirty(true);
              }}
            >
              <option value={0}>Без ограничения</option>
              <option value={30}>30 минут</option>
              <option value={60}>1 час</option>
              <option value={120}>2 часа</option>
              <option value={240}>4 часа</option>
              <option value={720}>12 часов</option>
              <option value={1440}>1 день</option>
            </select>
          </label>
          <FieldHint>{FIELD_HINTS.minNotice}</FieldHint>

          <details className="ai-schedule-help">
            <summary>Помочь настроить (AI)</summary>
            <textarea
              value={aiNotes}
              onChange={(e) => setAiNotes(e.target.value)}
              placeholder="Например: работаем пн–пт с 10 до 19, обед час, запись на месяц вперёд"
            />
            <button
              type="button"
              className="button button--outline"
              disabled={aiBusy}
              onClick={() => void aiHelp()}
            >
              {aiBusy ? "Готовим…" : "Предложить расписание"}
            </button>
          </details>
        </>
      ) : (
        <p>
          В ручном режиме добавьте свободные окна в блоке «Правила» ниже. Для
          большинства бизнесов удобнее автоматический режим.
        </p>
      )}

      <div className="auto-schedule__preview">
        <h3>Предварительный просмотр</h3>
        <FieldHint>
          Те же слоты, что увидит клиент (один серверный расчёт availability).
        </FieldHint>
        <label>
          Услуга
          <select
            value={previewService}
            onChange={(e) => setPreviewService(e.target.value)}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.duration_minutes} мин
              </option>
            ))}
          </select>
        </label>
        <label>
          Дата
          <input
            type="date"
            value={previewDate}
            onChange={(e) => setPreviewDate(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="button button--outline"
          onClick={() => void loadPreview()}
        >
          Показать свободное время
        </button>
        <CustomerPreview title="Свободное время для клиента" lines={previewLines} />
      </div>

      <StickySaveBar
        dirty={dirty}
        busy={busy}
        notice={savedNotice}
        error={error}
        saveLabel="Сохранить расписание"
        onSave={() => void save()}
      />
    </section>
  );
}
