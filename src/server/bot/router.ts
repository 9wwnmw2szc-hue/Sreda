import { messageChunks } from "../outbox/text.ts";
import { AppError } from "../http/errors.ts";
import { bindNotification } from "../notifications/settings.ts";
import type { InboundAttachment } from "../attachments/service.ts";
import { bookingFlow } from "./booking-flow.ts";
import { ordersFlow } from "./orders-flow.ts";
import type { Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { validateSetup } from "../solutions/service.ts";
import { getAvailableCustomerActions } from "../solutions/customer-actions.ts";
import { createLead } from "../leads/service.ts";
import { CommunicationService } from "../communications/service.ts";
import { normalizeIdentity } from "../clients/service.ts";
import type { LeadSetupDraft, LeadFieldId } from "../../lib/leadSetupDraft.ts";
import { routeChannelAdmin } from "../channel-admin/router.ts";
import { ChannelAdminBindingService } from "../channel-admin/binding.ts";
const defaults: Record<string, string> = {
  name: "Как к вам обращаться?",
  phone: "Ваш телефон",
  email: "Ваш email",
  message: "Ваше сообщение",
  service: "Что вас интересует?",
  comment: "Комментарий",
};
export async function routeBot(
  tx: Transaction<Database>,
  input: {
    businessId: string;
    connectionId: string;
    platform: "telegram" | "vk";
    userId: string;
    username?: string;
    eventId: string;
    text: string;
    attachments?: InboundAttachment[];
  },
) {
  const { businessId, connectionId, platform, userId, eventId } = input;
  const text = input.text.trim();
  const table = platform === "telegram" ? "telegram_dialog" : "vk_dialog";
  const b = await tx
    .selectFrom("business")
    .selectAll()
    .where("id", "=", businessId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (b.archived_at) {
    return;
  }
  const available = await getAvailableCustomerActions(tx, businessId, platform);
  const setup = await tx
    .selectFrom("lead_setup")
    .select("draft")
    .where("business_id", "=", businessId)
    .executeTakeFirst();
  const config = setup ? validateSetup(JSON.parse(setup.draft)) : undefined;
  const brand = b.public_name || b.name;
  const menu = [...available.labels];
  const queuePart = async (message: string, buttons: string[] = []) => {
    const value = {
      connection_id: connectionId,
      message,
      buttons: JSON.stringify(buttons),
      delivered_at: null,
      last_error: null,
    };
    if (platform === "telegram")
      await tx
        .insertInto("telegram_outbox")
        .values({ ...value, chat_id: userId })
        .execute();
    else
      await tx
        .insertInto("vk_outbox")
        .values({ ...value, peer_id: userId })
        .execute();
  };
  const queue = async (message: string, buttons: string[] = []) => {
    const parts = messageChunks(message);
    for (let i = 0; i < parts.length; i++)
      await queuePart(parts[i]!, i === parts.length - 1 ? buttons : []);
  };
  const current = await tx
    .selectFrom(table)
    .selectAll()
    .where("connection_id", "=", connectionId)
    .where("chat_id", "=", userId)
    .executeTakeFirst();
  if (
    platform === "telegram" &&
    current &&
    BigInt(eventId) <= BigInt(current.last_update_id)
  )
    return;
  const save = async (
    mode: string,
    fields: string[] = [],
    answers: Record<string, string> = {},
    position = 0,
    snapshot: LeadSetupDraft | Record<string, never> = {},
  ) => {
    const row = {
      connection_id: connectionId,
      chat_id: userId,
      mode,
      fields: JSON.stringify(fields),
      answers: JSON.stringify(answers),
      position,
      config: JSON.stringify(snapshot),
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
  const showMenu = async (message?: string) => {
    // Always re-resolve so disabled solutions disappear immediately.
    const fresh = await getAvailableCustomerActions(tx, businessId, platform);
    menu.length = 0;
    menu.push(...fresh.labels);
    await save("menu");
    const welcome =
      (b.greeting && b.greeting.trim()) ||
      `Добро пожаловать в ${brand}!`;
    // Bot represents the owner's business — never introduce as platform «Среда».
    const safeWelcome = /бот\s+сервис/i.test(welcome)
      ? `Добро пожаловать в ${brand}!`
      : welcome;
    await queue(
      message ??
        safeWelcome +
          (menu.length
            ? "\n\nЧем можем помочь?"
            : "\n\nПриём обращений пока не настроен. Напишите сообщение — передам команде."),
      menu,
    );
  };
  const denyDisabled = async (label: string) => {
    await showMenu(
      `${label} сейчас недоступно для этого бизнеса. Выберите другое действие.`,
    );
  };
  const notifyCode =
    text.match(/^\/start\s+notify_([\w-]{32})$/)?.[1] ??
    text.match(/^notify_([\w-]{32})$/)?.[1];
  if (notifyCode) {
    const ok = await bindNotification(
      tx,
      businessId,
      connectionId,
      userId,
      notifyCode,
    );
    await queue(
      ok
        ? "Уведомления сотрудника подключены."
        : "Код недействителен или истёк. Создайте новый код на сайте.",
    );
    return;
  }
  if (await routeChannelAdmin(tx, input, queue)) return;
  if (text === "/start" || text === "/menu" || text === "Главное меню") {
    const admin = await new ChannelAdminBindingService(tx).resolveAdmin(tx, {
      connectionId,
      businessId,
      platform,
      externalUserId: userId,
    });
    if (admin && !menu.includes("Управление бизнесом"))
      menu.push("Управление бизнесом");
    await showMenu();
    return;
  }
  if (text === "/cancel" || text === "Отмена") {
    await showMenu("Действие отменено. Выберите действие.");
    return;
  }
  const intended = available.match(text);
  const startLead = intended === "leads" || text === "/lead";
  const contactAdmin = intended === "admin_messages";

  // Stale callbacks / labels for disabled solutions must not run.
  if (
    (text === "/lead" ||
      text === (config?.title || "Оставить заявку") ||
      text === available.leadTitle) &&
    !available.has("leads")
  ) {
    await denyDisabled("Приём заявок");
    return;
  }
  if (
    (text === "Связаться с администратором" ||
      text === "Связаться с администрацией" ||
      text === "Связаться с магазином") &&
    !available.has("admin_messages")
  ) {
    await denyDisabled("Связь с администратором");
    return;
  }
  if (
    (text === "Каталог" || text === "Корзина") &&
    !available.has("orders")
  ) {
    await denyDisabled("Заказы");
    return;
  }
  if (
    (text === "Записаться" ||
      text === "Мои записи" ||
      text === "Онлайн-запись") &&
    !available.has("booking")
  ) {
    await denyDisabled("Онлайн-запись");
    return;
  }

  // Explicit menu actions may switch away from an unfinished dialogue.
  if (available.has("booking") && !startLead && !contactAdmin) {
    try {
      if (await bookingFlow(tx, input, queue)) return;
    } catch (error) {
      if (
        !(error instanceof AppError) ||
        error.status >= 500 ||
        error.status === 429
      )
        throw error;
      await showMenu(error.message + " Выберите действие заново.");
      return;
    }
  }
  if (available.has("orders") && !startLead && !contactAdmin) {
    try {
      if (
        await ordersFlow(tx, input, queue, {
          contactShop: available.has("admin_messages"),
        })
      )
        return;
    } catch (error) {
      if (
        !(error instanceof AppError) ||
        error.status >= 500 ||
        error.status === 429
      )
        throw error;
      await showMenu(error.message + " Выберите действие заново.");
      return;
    }
  }
  if (contactAdmin && available.has("admin_messages")) {
    await save("messages");
    await queue("Напишите ваш вопрос.", ["Главное меню"]);
    return;
  }
  if (
    !startLead &&
    current?.mode === "messages" &&
    available.has("admin_messages")
  ) {
    const result = await new CommunicationService(
      tx,
    ).recordInboundInTransaction(tx, {
      businessId,
      platform,
      externalUserId: userId,
      externalUsername: input.username,
      text,
      externalMessageId: connectionId + ":" + eventId,
      connectionId,
      attachments: input.attachments,
    });
    if (result.accepted && !result.duplicate)
      await queue("Сообщение отправлено. Администратор ответит вам здесь.", [
        "Главное меню",
      ]);
    return;
  }
  if (
    !startLead &&
    current?.mode === "messages" &&
    !available.has("admin_messages")
  ) {
    await denyDisabled("Связь с администратором");
    return;
  }
  const ask = (snapshot: LeadSetupDraft, field: string) => {
    const option = snapshot.fieldOptions?.[field as LeadFieldId];
    return (
      (option?.label || defaults[field] || field) +
      (field === "name" || option?.required ? "" : "\nМожно пропустить: /skip.")
    );
  };
  if (startLead && available.has("leads") && config) {
    const fields = ["name", ...config.fields.filter((x) => x !== "name")];
    await save("leads", fields, {}, 0, config);
    await queue(
      (config.greeting ||
        `Здравствуйте! Оставьте заявку в ${b.public_name || b.name}.`) +
        "\n\n" +
        ask(config, fields[0]!),
      ["Отмена"],
    );
    return;
  }
  if (
    !current ||
    !["leads", "review"].includes(current.mode) ||
    Date.now() - current.updated_at.getTime() > 86400000
  ) {
    await showMenu();
    return;
  }
  if (!available.has("leads")) {
    await showMenu("Приём заявок временно недоступен.");
    return;
  }
  const snapshot = JSON.parse(current.config) as LeadSetupDraft;
  const fields = JSON.parse(current.fields) as string[];
  const answers = JSON.parse(current.answers) as Record<string, string>;
  if (current.mode === "review") {
    if (text === "Изменить") {
      await save("leads", fields, {}, 0, snapshot);
      await queue(ask(snapshot, fields[0]!), ["Отмена"]);
      return;
    }
    if (text !== "Отправить") {
      await queue("Проверьте заявку и нажмите «Отправить».", [
        "Отправить",
        "Изменить",
        "Отмена",
      ]);
      return;
    }
    await createLead(tx, businessId, {
      source: platform,
      name: answers.name!,
      phone: answers.phone || null,
      message: [
        answers.message,
        answers.service,
        answers.comment,
        answers.email,
      ]
        .filter(Boolean)
        .join("\n"),
      externalEventId: connectionId + ":" + eventId,
      platformUserId: userId,
      username: input.username,
      answers,
    });
    await save("menu");
    const fresh = await getAvailableCustomerActions(tx, businessId, platform);
    await queue(
      snapshot.finalMessage ||
        "Спасибо! Ваша заявка принята. Мы скоро свяжемся с вами.",
      fresh.labels,
    );
    return;
  }
  const field = fields[current.position]!;
  const required =
    field === "name" || snapshot.fieldOptions?.[field as LeadFieldId]?.required;
  if (
    !text ||
    text.length > (field === "name" ? 100 : 900) ||
    (text === "/skip" && required) ||
    (text.startsWith("/") && text !== "/skip")
  ) {
    await queue("Проверьте ответ. " + ask(snapshot, field));
    return;
  }
  let answer = text === "/skip" ? "" : text;
  if (answer && (field === "phone" || field === "email")) {
    try {
      answer = normalizeIdentity({ kind: field, value: answer }).value;
    } catch {
      await queue(
        field === "phone"
          ? "Введите телефон в формате +79991234567."
          : "Проверьте email.",
      );
      return;
    }
  }
  answers[field] = answer;
  const next = current.position + 1;
  if (next < fields.length) {
    await save("leads", fields, answers, next, snapshot);
    await queue(ask(snapshot, fields[next]!), ["Отмена"]);
    return;
  }
  await save("review", fields, answers, next, snapshot);
  await queue(
    "Проверьте заявку:\n\n" +
      fields
        .map(
          (f) =>
            (snapshot.fieldOptions?.[f as LeadFieldId]?.label ||
              defaults[f] ||
              f) +
            ": " +
            (answers[f] || "—"),
        )
        .join("\n"),
    ["Отправить", "Изменить", "Отмена"],
  );
}
