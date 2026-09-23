"use client";
import { useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { SetupWizardShell } from "@/components/ui/SetupChrome";
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from "@/lib/setupUx";

type SpecialistMode = "one" | "several" | "none";

type CatalogLite = {
  services: { id: string; name: string; duration_minutes: number; price: string | null }[];
  specialists: { id: string; name: string }[];
  schedules: { specialist_id: string; weekday: number }[];
  settings: {
    minimum_booking_notice?: number;
    maximum_booking_horizon?: number;
    choose_specialist?: boolean;
  };
};

const STEP_TITLES = [
  "Услуги",
  "Кто оказывает",
  "Расписание",
  "Правила",
  "Проверка",
  "Запустить",
] as const;

const TOTAL_STEPS = STEP_TITLES.length;

function toMinutes(hhmm: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function dayIntervals(
  workStart: string,
  workEnd: string,
  breakStart: string,
  breakEnd: string,
) {
  const start = toMinutes(workStart);
  const end = toMinutes(workEnd);
  if (start == null || end == null || start >= end) {
    throw new Error("Проверьте рабочие часы.");
  }
  const bStart = toMinutes(breakStart);
  const bEnd = toMinutes(breakEnd);
  if (bStart == null || bEnd == null || bStart >= bEnd) {
    return [{ start, end }];
  }
  if (bEnd <= start || bStart >= end) return [{ start, end }];
  const open: { start: number; end: number }[] = [];
  if (start < bStart) open.push({ start, end: Math.min(bStart, end) });
  if (bEnd < end) open.push({ start: Math.max(bEnd, start), end });
  return open.length ? open : [{ start, end }];
}

export function BookingSetupWizard({
  businessId,
  businessName,
  timezone,
  catalog,
  onComplete,
  onSkipToAdvanced,
  initialStep,
  onStepSaved,
}: {
  businessId: string;
  businessName: string;
  timezone: string;
  catalog: CatalogLite;
  onComplete: () => Promise<void>;
  onSkipToAdvanced?: () => void;
  initialStep?: number;
  onStepSaved?: (step: number) => void | Promise<void>;
}) {
  const base = `/api/v1/businesses/${businessId}`;
  const startStep =
    typeof initialStep === "number" &&
    initialStep >= 1 &&
    initialStep <= TOTAL_STEPS
      ? initialStep
      : 1;
  const [step, setStep] = useState(startStep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [serviceName, setServiceName] = useState(
    catalog.services[0]?.name ?? "",
  );
  const [duration, setDuration] = useState(
    catalog.services[0]?.duration_minutes ?? 60,
  );
  const [price, setPrice] = useState(catalog.services[0]?.price ?? "");
  const [description, setDescription] = useState("");
  const [serviceId, setServiceId] = useState(catalog.services[0]?.id ?? "");

  const [specialistMode, setSpecialistMode] = useState<SpecialistMode>(
    catalog.settings.choose_specialist === false
      ? "none"
      : catalog.specialists.length > 1
        ? "several"
        : "one",
  );
  const [singleName, setSingleName] = useState(
    catalog.specialists[0]?.name || businessName || "Я",
  );
  const [names, setNames] = useState<string[]>(
    catalog.specialists.length > 1
      ? catalog.specialists.map((s) => s.name)
      : ["", ""],
  );
  const [specialistIds, setSpecialistIds] = useState<string[]>(
    catalog.specialists.map((s) => s.id),
  );

  const [workdays, setWorkdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [breakStart, setBreakStart] = useState("13:00");
  const [breakEnd, setBreakEnd] = useState("14:00");
  const [bufferAfter, setBufferAfter] = useState(15);
  const [noticeMin, setNoticeMin] = useState(
    catalog.settings.minimum_booking_notice ?? 120,
  );
  const [horizon, setHorizon] = useState(
    catalog.settings.maximum_booking_horizon ?? 30,
  );
  const [launched, setLaunched] = useState(false);

  async function save(body: unknown) {
    return apiRequest(base + "/booking-config", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async function ensureLinks(specIds: string[], svcId: string) {
    for (const specialist_id of specIds) {
      await save({
        kind: "links",
        specialist_id,
        service_ids: [svcId],
      });
    }
  }

  async function stepServices() {
    const name = serviceName.trim();
    if (!name) throw new Error("Укажите название услуги.");
    if (duration < 5) throw new Error("Длительность — минимум 5 минут.");
    const result = await save({
      kind: "service",
      id: serviceId || undefined,
      name,
      description: description.trim(),
      duration_minutes: duration,
      buffer_before_minutes: 0,
      buffer_after_minutes: bufferAfter,
      currency: "RUB",
      price: price === "" ? null : price,
      active: true,
    });
    const id =
      result && typeof result === "object" && "id" in result
        ? String((result as { id: string }).id)
        : serviceId;
    if (!id) throw new Error("Не удалось сохранить услугу.");
    setServiceId(id);
    return id;
  }

  async function stepSpecialists(svcId: string) {
    if (specialistMode === "none") {
      let ids = specialistIds;
      if (!ids.length) {
        const created = await save({
          kind: "specialist",
          name: businessName.trim() || "Я",
          description: "",
          active: true,
        });
        const id = String((created as { id: string }).id);
        ids = [id];
        setSpecialistIds(ids);
      }
      await save({
        kind: "settings",
        choose_specialist: false,
        schedule_mode: "automatic",
      });
      await ensureLinks(ids, svcId);
      return ids;
    }

    if (specialistMode === "one") {
      const name = singleName.trim() || businessName.trim() || "Я";
      let id = specialistIds[0];
      if (id) {
        await save({
          kind: "specialist",
          id,
          name,
          description: "",
          active: true,
        });
      } else {
        const created = await save({
          kind: "specialist",
          name,
          description: "",
          active: true,
        });
        id = String((created as { id: string }).id);
      }
      const ids = [id];
      setSpecialistIds(ids);
      await save({
        kind: "settings",
        choose_specialist: true,
        schedule_mode: "automatic",
      });
      await ensureLinks(ids, svcId);
      return ids;
    }

    const cleaned = names.map((n) => n.trim()).filter(Boolean);
    if (cleaned.length < 2) {
      throw new Error("Добавьте хотя бы два имени специалиста.");
    }
    const ids: string[] = [];
    for (let i = 0; i < cleaned.length; i++) {
      const existing = specialistIds[i];
      if (existing) {
        await save({
          kind: "specialist",
          id: existing,
          name: cleaned[i],
          description: "",
          active: true,
        });
        ids.push(existing);
      } else {
        const created = await save({
          kind: "specialist",
          name: cleaned[i],
          description: "",
          active: true,
        });
        ids.push(String((created as { id: string }).id));
      }
    }
    setSpecialistIds(ids);
    await save({
      kind: "settings",
      choose_specialist: true,
      schedule_mode: "automatic",
    });
    await ensureLinks(ids, svcId);
    return ids;
  }

  async function stepSchedule(specIds: string[]) {
    if (!workdays.length) throw new Error("Выберите хотя бы один рабочий день.");
    const intervals = dayIntervals(workStart, workEnd, breakStart, breakEnd);
    const days = WEEKDAY_ORDER.map((weekday) => ({
      weekday,
      intervals: workdays.includes(weekday) ? intervals : [],
    }));
    for (const specialist_id of specIds) {
      await save({
        kind: "schedule_bulk",
        specialist_id,
        days,
      });
    }
    if (serviceId) {
      await save({
        kind: "service",
        id: serviceId,
        name: serviceName.trim(),
        description: description.trim(),
        duration_minutes: duration,
        buffer_before_minutes: 0,
        buffer_after_minutes: bufferAfter,
        currency: "RUB",
        price: price === "" ? null : price,
        active: true,
      });
    }
  }

  async function stepRules() {
    await save({
      kind: "settings",
      schedule_mode: "automatic",
      minimum_booking_notice: noticeMin,
      maximum_booking_horizon: horizon,
      choose_specialist: specialistMode !== "none",
    });
  }

  async function stepLaunch() {
    await apiRequest(`/api/v1/businesses/${businessId}/solutions`, {
      method: "POST",
      body: JSON.stringify({ code: "booking", enabled: true }),
    });
    setLaunched(true);
  }

  async function goNext() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let nextStep = step;
      if (step === 1) {
        await stepServices();
        setNotice("Услуга сохранена.");
        nextStep = 2;
        setStep(2);
      } else if (step === 2) {
        const svcId = serviceId || (await stepServices());
        await stepSpecialists(svcId);
        setNotice("Специалисты настроены.");
        nextStep = 3;
        setStep(3);
      } else if (step === 3) {
        const ids =
          specialistIds.length > 0
            ? specialistIds
            : await stepSpecialists(serviceId);
        await stepSchedule(ids);
        setNotice("Расписание сохранено.");
        nextStep = 4;
        setStep(4);
      } else if (step === 4) {
        await stepRules();
        setNotice("Правила сохранены.");
        nextStep = 5;
        setStep(5);
      } else if (step === 5) {
        nextStep = 6;
        setStep(6);
      } else if (step === 6) {
        if (!launched) await stepLaunch();
        await onComplete();
        setNotice("Онлайн-запись запущена.");
        nextStep = 6;
      }
      if (step < 6 && onStepSaved) await onStepSaved(nextStep);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить шаг.");
    } finally {
      setBusy(false);
    }
  }

  const specialistSummary =
    specialistMode === "none"
      ? "Без выбора специалиста"
      : specialistMode === "one"
        ? singleName.trim() || "Я"
        : names
            .map((n) => n.trim())
            .filter(Boolean)
            .join(", ");

  const workdaySummary = WEEKDAY_ORDER.filter((d) => workdays.includes(d))
    .map((d) => WEEKDAY_LABELS[d]!.slice(0, 2))
    .join(", ");

  return (
    <section
      className="panel crm-panel booking-setup-wizard"
      id="booking-setup-wizard"
      aria-label="Мастер настройки записи"
    >
      <SetupWizardShell
        title="Настройка онлайн-записи"
        subtitle={`Часовой пояс: ${timezone}`}
        step={step}
        stepCount={TOTAL_STEPS}
        stepTitle={STEP_TITLES[step - 1]!}
        onBack={step > 1 && step < 6 ? () => setStep((s) => s - 1) : undefined}
        onNext={() => void goNext()}
        nextLabel={
          step === 5
            ? "Далее"
            : step === 6
              ? launched
                ? "К календарю"
                : "Запустить запись"
              : "Продолжить"
        }
        busy={busy}
        notice={notice}
        error={error}
      >
        {step === 1 ? (
          <>
            <p>Создайте хотя бы одну услугу — клиенты будут выбирать её при записи.</p>
            <label>
              Название
              <input
                required
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="Например, Стрижка"
              />
            </label>
            <label>
              Длительность, мин
              <input
                type="number"
                min={5}
                required
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </label>
            <label>
              Цена (необязательно)
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
              />
            </label>
            <label>
              Описание (необязательно)
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </label>
          </>
        ) : null}

        {step === 2 ? (
          <fieldset className="booking-setup-wizard__choice">
            <legend>Кто оказывает услуги?</legend>
            <label>
              <input
                type="radio"
                name="specialist-mode"
                checked={specialistMode === "one"}
                onChange={() => setSpecialistMode("one")}
              />
              <span>
                <strong>Я / один специалист</strong>
                <br />
                Клиент записывается к одному человеку.
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="specialist-mode"
                checked={specialistMode === "several"}
                onChange={() => setSpecialistMode("several")}
              />
              <span>
                <strong>Несколько специалистов</strong>
                <br />
                Клиент сможет выбрать, к кому записаться.
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="specialist-mode"
                checked={specialistMode === "none"}
                onChange={() => setSpecialistMode("none")}
              />
              <span>
                <strong>Без выбора специалиста</strong>
                <br />
                Клиент выбирает только услугу и время.
              </span>
            </label>
            {specialistMode === "one" ? (
              <label>
                Имя
                <input
                  value={singleName}
                  onChange={(e) => setSingleName(e.target.value)}
                  placeholder={businessName || "Я"}
                />
              </label>
            ) : null}
            {specialistMode === "several" ? (
              <div className="booking-setup-wizard__names">
                {names.map((name, index) => (
                  <div className="booking-setup-wizard__names-row" key={index}>
                    <input
                      value={name}
                      onChange={(e) => {
                        const next = [...names];
                        next[index] = e.target.value;
                        setNames(next);
                      }}
                      placeholder={`Специалист ${index + 1}`}
                    />
                    {names.length > 2 ? (
                      <button
                        type="button"
                        className="button button--outline"
                        onClick={() =>
                          setNames(names.filter((_, i) => i !== index))
                        }
                      >
                        Удалить
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="button button--outline"
                  onClick={() => setNames([...names, ""])}
                >
                  + Добавить
                </button>
              </div>
            ) : null}
          </fieldset>
        ) : null}

        {step === 3 ? (
          <>
            <p>
              Автоматическое расписание: укажите рабочие дни и часы — свободные
              слоты рассчитаются сами.
            </p>
            <div className="booking-setup-wizard__weekdays" role="group" aria-label="Рабочие дни">
              {WEEKDAY_ORDER.map((d) => (
                <label key={d}>
                  <input
                    type="checkbox"
                    checked={workdays.includes(d)}
                    onChange={(e) =>
                      setWorkdays(
                        e.target.checked
                          ? [...workdays, d]
                          : workdays.filter((x) => x !== d),
                      )
                    }
                  />{" "}
                  {WEEKDAY_LABELS[d]!.slice(0, 2)}
                </label>
              ))}
            </div>
            <label>
              Начало дня
              <input
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
              />
            </label>
            <label>
              Конец дня
              <input
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
              />
            </label>
            <label>
              Перерыв с
              <input
                type="time"
                value={breakStart}
                onChange={(e) => setBreakStart(e.target.value)}
              />
            </label>
            <label>
              Перерыв до
              <input
                type="time"
                value={breakEnd}
                onChange={(e) => setBreakEnd(e.target.value)}
              />
            </label>
            <label>
              Перерыв между клиентами, мин
              <select
                value={bufferAfter}
                onChange={(e) => setBufferAfter(Number(e.target.value))}
              >
                {[0, 5, 10, 15, 30].map((n) => (
                  <option key={n} value={n}>
                    {n} мин
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <label>
              За сколько времени до начала ещё можно записаться?
              <select
                value={noticeMin}
                onChange={(e) => setNoticeMin(Number(e.target.value))}
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
            <label>
              На сколько дней вперёд открыта запись?
              <select
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
              >
                {[7, 14, 30, 60, 90].map((n) => (
                  <option key={n} value={n}>
                    {n} дней
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {step === 5 ? (
          <ul className="booking-setup-wizard__summary">
            <li>
              <strong>Услуга:</strong> {serviceName.trim() || "—"} · {duration}{" "}
              мин
              {price ? ` · ${price} ₽` : ""}
            </li>
            <li>
              <strong>Кто оказывает:</strong> {specialistSummary || "—"}
            </li>
            <li>
              <strong>Расписание:</strong> {workdaySummary || "—"}, {workStart}–
              {workEnd}
              {breakStart && breakEnd
                ? `, перерыв ${breakStart}–${breakEnd}`
                : ""}
            </li>
            <li>
              <strong>Правила:</strong> горизонт {horizon} дн., уведомление за{" "}
              {noticeMin === 0 ? "без ограничения" : `${noticeMin} мин`}
            </li>
          </ul>
        ) : null}

        {step === 6 ? (
          <>
            <p>
              {launched
                ? "Онлайн-запись активна. Можно принимать клиентов в календаре."
                : "Включите решение «Онлайн-запись» и откройте календарь."}
            </p>
            {launched ? (
              <a className="button button--primary" href="/bookings">
                Открыть календарь
              </a>
            ) : null}
          </>
        ) : null}

        {onSkipToAdvanced ? (
          <p>
            <button
              type="button"
              className="button button--ghost"
              onClick={onSkipToAdvanced}
            >
              Перейти к расширенным настройкам
            </button>
          </p>
        ) : null}
      </SetupWizardShell>
    </section>
  );
}
