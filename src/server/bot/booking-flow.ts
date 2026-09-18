import { sql, type Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { availableSlots, BookingService } from "../booking/service.ts";
import { matchClient } from "../clients/service.ts";
import { localDay, dateOnly } from "../booking/time.ts";
export async function bookingFlow(
  tx: Transaction<Database>,
  input: {
    businessId: string;
    connectionId: string;
    platform: "telegram" | "vk";
    userId: string;
    eventId: string;
    text: string;
  },
  queue: (text: string, buttons?: string[]) => Promise<void>,
) {
  const { businessId, connectionId, platform, userId, eventId, text } = input;
  const table = platform === "telegram" ? "telegram_dialog" : "vk_dialog";
  const state = await tx
    .selectFrom(table)
    .selectAll()
    .where("connection_id", "=", connectionId)
    .where("chat_id", "=", userId)
    .executeTakeFirst();
  const direct = text.match(/^(Перенести|Отменить) ([a-f0-9]{8})$/);
  if (
    !direct &&
    !["Записаться", "Онлайн-запись", "Мои записи"].includes(text) &&
    !state?.mode.startsWith("booking:")
  )
    return false;
  const b = await tx
    .selectFrom("business")
    .select(["timezone", "public_name", "name"])
    .where("id", "=", businessId)
    .executeTakeFirstOrThrow();
  const service = new BookingService(tx);
  let answers: Record<string, string> = state ? JSON.parse(state.answers) : {};
  const save = async (
    mode: string,
    choices: { label: string; value: string }[] = [],
  ) => {
    const row = {
      connection_id: connectionId,
      chat_id: userId,
      mode: "booking:" + mode,
      fields: JSON.stringify(choices),
      answers: JSON.stringify(answers),
      position: 0,
      config: "{}",
      last_update_id: eventId,
      updated_at: new Date(),
    };
    await tx
      .insertInto(table)
      .values(row)
      .onConflict((oc) =>
        oc.columns(["connection_id", "chat_id"]).doUpdateSet(row),
      )
      .execute();
  };
  const menu = async (message: string) => {
    await tx
      .updateTable(table)
      .set({ mode: "menu", answers: "{}", last_update_id: eventId })
      .where("connection_id", "=", connectionId)
      .where("chat_id", "=", userId)
      .execute();
    await queue(message, ["Главное меню", "Мои записи"]);
  };
  const showChoices = async (
    mode: string,
    title: string,
    choices: { label: string; value: string }[],
    page = 0,
  ) => {
    answers.choicePage = String(page);
    await save(mode, choices);
    await queue(
      title,
      choices
        .slice(page * 7, page * 7 + 7)
        .map((c) => c.label)
        .concat(
          page > 0 ? ["← Назад по списку"] : [],
          (page + 1) * 7 < choices.length ? ["Далее →"] : [],
          ["Отмена"],
        ),
    );
  };
  const datePrompt = async () => {
    await save("date");
    const today = localDay(new Date(), b.timezone);
    await queue(
      "Выберите дату или напишите её в формате ГГГГ-ММ-ДД.",
      Array.from({ length: 7 }, (_, i) =>
        new Date(Date.parse(today) + i * 86400000).toISOString().slice(0, 10),
      ).concat("Отмена"),
    );
  };
  if (direct) {
    const identity = await tx
      .selectFrom("client_identity")
      .select("client_id")
      .where("business_id", "=", businessId)
      .where("kind", "=", platform)
      .where("value", "=", userId)
      .executeTakeFirst();
    const bookings = identity
      ? await tx
          .selectFrom("booking")
          .selectAll()
          .where("business_id", "=", businessId)
          .where("client_id", "=", identity.client_id)
          .where("status", "in", ["pending", "confirmed"])
          .where("starts_at", ">", new Date())
          .where(sql<boolean>`id::text like ${direct[2] + "%"}`)
          .limit(2)
          .execute()
      : [];
    if (bookings.length !== 1) {
      await queue("Запись недоступна. Откройте актуальный список.", [
        "Мои записи",
        "Главное меню",
      ]);
      return true;
    }
    const booking = bookings[0]!;
    answers = {
      bookingId: booking.id,
      clientId: booking.client_id,
      revision: String(booking.revision),
      service: booking.service_id,
      specialist: booking.specialist_id,
      start: booking.starts_at.toISOString(),
    };
    if (direct[1] === "Перенести") await datePrompt();
    else {
      await save("cancel");
      await queue(
        "Отменить запись на " +
          booking.starts_at.toLocaleString("ru", { timeZone: b.timezone }) +
          "?",
        ["Да, отменить", "Отмена"],
      );
    }
    return true;
  }
  if (text === "Мои записи") {
    answers = {};
    const identity = await tx
      .selectFrom("client_identity")
      .select("client_id")
      .where("business_id", "=", businessId)
      .where("kind", "=", platform)
      .where("value", "=", userId)
      .executeTakeFirst();
    const bookings = identity
      ? await tx
          .selectFrom("booking")
          .selectAll()
          .where("business_id", "=", businessId)
          .where("client_id", "=", identity.client_id)
          .where("status", "in", ["pending", "confirmed"])
          .where("starts_at", ">", new Date())
          .orderBy("starts_at")
          .limit(100)
          .execute()
      : [];
    if (!bookings.length) {
      await save("list");
      await menu("Будущих записей пока нет.");
      return true;
    }
    const choices = bookings.map((v, i) => ({
      label: `${i + 1}. ${v.starts_at.toLocaleString("ru", { timeZone: b.timezone })}`,
      value: v.id,
    }));
    await showChoices("list", "Ваши записи:", choices);
    return true;
  }
  if (text === "Записаться" || text === "Онлайн-запись") {
    answers = {};
    const catalog = await service.catalogForBusiness(businessId);
    const choices = catalog.services
      .filter((s) => s.active)
      .map((s, i) => ({
        label: `${i + 1}. ${s.name}`.slice(0, 100),
        value: s.id,
      }));
    await showChoices(
      "service",
      choices.length ? "Выберите услугу." : "Услуги пока не настроены.",
      choices,
    );
    return true;
  }
  const choices = state
    ? (JSON.parse(state.fields) as { label: string; value: string }[])
    : [];
  const picked = choices.find(
    (c) => c.label === text || c.value === text,
  )?.value;
  const mode = state?.mode.slice(8);
  if (
    ["service", "specialist", "list"].includes(mode ?? "") &&
    ["Далее →", "← Назад по списку"].includes(text)
  ) {
    const page = Math.max(
      0,
      Math.min(
        Math.floor((choices.length - 1) / 7),
        Number(answers.choicePage ?? 0) + (text === "Далее →" ? 1 : -1),
      ),
    );
    await showChoices(mode!, "Выберите вариант.", choices, page);
    return true;
  }
  if (text === "Назад" && ["time", "name", "confirm"].includes(mode ?? "")) {
    await datePrompt();
    return true;
  }
  if (mode === "list" && picked) {
    const identity = await tx
      .selectFrom("client_identity")
      .select("client_id")
      .where("business_id", "=", businessId)
      .where("kind", "=", platform)
      .where("value", "=", userId)
      .executeTakeFirst();
    const booking = identity
      ? await tx
          .selectFrom("booking")
          .selectAll()
          .where("business_id", "=", businessId)
          .where("client_id", "=", identity.client_id)
          .where("id", "=", picked)
          .executeTakeFirst()
      : null;
    if (!booking) {
      await menu("Запись не найдена.");
      return true;
    }
    answers = {
      bookingId: booking.id,
      clientId: booking.client_id,
      revision: String(booking.revision),
      service: booking.service_id,
      specialist: booking.specialist_id,
      start: booking.starts_at.toISOString(),
    };
    await save("manage");
    await queue("Что сделать с записью?", [
      "Перенести",
      "Отменить запись",
      "Отмена",
    ]);
    return true;
  }
  if (mode === "manage") {
    if (text === "Перенести") {
      await datePrompt();
      return true;
    }
    if (text === "Отменить запись") {
      await save("cancel");
      await queue(
        "Отменить запись на " +
          new Date(answers.start!).toLocaleString("ru", {
            timeZone: b.timezone,
          }) +
          "?",
        ["Да, отменить", "Отмена"],
      );
      return true;
    }
  }
  if (mode === "cancel" && text === "Да, отменить") {
    await service.changeInTransaction(
      tx,
      businessId,
      answers.bookingId!,
      { action: "cancel", revision: Number(answers.revision) },
      null,
      answers.clientId,
    );
    await menu("Запись отменена.");
    return true;
  }
  if (mode === "service" && picked) {
    answers.service = picked;
    const catalog = await service.catalogForBusiness(businessId);
    const resources = catalog.specialists
      .filter(
        (s) =>
          s.active &&
          catalog.links.some(
            (l) => l.service_id === picked && l.specialist_id === s.id,
          ),
      )
      .map((s, i) => ({
        label: `${i + 1}. ${s.name}`.slice(0, 100),
        value: s.id,
      }));
    if (catalog.settings.choose_specialist === false) {
      if (!resources.length) {
        await queue("Для услуги пока нет специалистов.", ["Отмена"]);
        return true;
      }
      answers.specialist = resources[0]!.value;
      await datePrompt();
      return true;
    }
    await showChoices(
      "specialist",
      resources.length
        ? "Выберите специалиста."
        : "Для услуги пока нет специалистов.",
      resources,
    );
    return true;
  }
  if (mode === "specialist" && picked) {
    answers.specialist = picked;
    await datePrompt();
    return true;
  }
  if (mode === "date" || (mode === "time" && text === "Другое время")) {
    if (mode === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        await queue("Введите дату в формате ГГГГ-ММ-ДД.");
        return true;
      }
      try {
        dateOnly(text);
      } catch {
        await queue("Проверьте дату. Например: 2026-10-20.");
        return true;
      }
      answers.date = text;
      answers.page = "0";
    } else answers.page = String(Number(answers.page ?? 0) + 1);
    const catalog = await service.catalogForBusiness(businessId);
    let specialistId = answers.specialist!;
    let slots = await availableSlots(
      tx,
      businessId,
      answers.service!,
      specialistId,
      answers.date!,
      answers.bookingId,
    );
    if (
      catalog.settings.choose_specialist === false &&
      !slots.length &&
      mode === "date"
    ) {
      const candidates = catalog.specialists.filter(
        (s) =>
          s.active &&
          catalog.links.some(
            (l) =>
              l.service_id === answers.service && l.specialist_id === s.id,
          ),
      );
      for (const candidate of candidates) {
        if (candidate.id === specialistId) continue;
        const next = await availableSlots(
          tx,
          businessId,
          answers.service!,
          candidate.id,
          answers.date!,
          answers.bookingId,
        );
        if (next.length) {
          specialistId = candidate.id;
          answers.specialist = candidate.id;
          slots = next;
          break;
        }
      }
    }
    const page = Number(answers.page ?? 0);
    const start = (page * 7) % Math.max(slots.length, 1);
    const times = slots
      .slice(start, start + 7)
      .map((s) => ({
        label: new Date(s).toLocaleTimeString("ru", {
          timeZone: b.timezone,
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "shortOffset",
        }),
        value: s,
      }));
    if (!times.length) {
      await queue("На эту дату нет свободного времени.");
      await datePrompt();
      return true;
    }
    await save("time", times);
    await queue(
      "Выберите время.",
      times
        .map((c) => c.label)
        .concat(
          slots.length > 7
            ? ["Другое время", "Назад", "Отмена"]
            : ["Назад", "Отмена"],
        ),
    );
    return true;
  }
  if (mode === "time" && picked) {
    answers.start = picked;
    if (answers.bookingId) {
      await save("confirm");
      await queue(
        "Перенести запись на " +
          new Date(picked).toLocaleString("ru", { timeZone: b.timezone }) +
          "?",
        ["Подтвердить", "Назад", "Отмена"],
      );
    } else {
      await save("name");
      await queue("Как к вам обращаться?", ["Отмена"]);
    }
    return true;
  }
  if (mode === "name") {
    if (!text.trim() || text.length > 100) {
      await queue("Введите имя до 100 символов.");
      return true;
    }
    answers.name = text.trim();
    const catalog = await service.catalogForBusiness(businessId);
    const item = catalog.services.find((s) => s.id === answers.service);
    const resource = catalog.specialists.find(
      (s) => s.id === answers.specialist,
    );
    await save("confirm");
    await queue(
      `${item?.name}\n${resource?.name}\n${new Date(answers.start!).toLocaleString("ru", { timeZone: b.timezone })}\n${item?.price ? item.price + " " + item.currency : ""}\nПодтвердить запись?`,
      ["Подтвердить", "Назад", "Отмена"],
    );
    return true;
  }
  if (mode === "confirm" && text === "Подтвердить") {
    try {
      if (answers.bookingId)
        await service.changeInTransaction(
          tx,
          businessId,
          answers.bookingId,
          {
            action: "reschedule",
            revision: Number(answers.revision),
            starts_at: answers.start,
          },
          null,
          answers.clientId,
        );
      else {
        const clientId = await matchClient(tx, businessId, {
          name: answers.name,
          identities: [{ kind: platform, value: userId }],
        });
        await service.createInTransaction(
          tx,
          businessId,
          clientId,
          {
            service_id: answers.service,
            specialist_id: answers.specialist,
            starts_at: answers.start,
            request_key: connectionId + ":" + eventId,
          },
          null,
          platform,
        );
      }
      await menu(
        "Вы записаны в " +
          (b.public_name || b.name) +
          " на " +
          new Date(answers.start!).toLocaleString("ru", {
            timeZone: b.timezone,
          }) +
          ".",
      );
    } catch (error) {
      if ((error as { code?: string }).code !== "BOOKING_SLOT_UNAVAILABLE")
        throw error;
      await queue("Это время уже занято. Выберите другое.");
      await datePrompt();
    }
    return true;
  }
  await queue("Выберите действие кнопкой или напишите /cancel.");
  return true;
}
