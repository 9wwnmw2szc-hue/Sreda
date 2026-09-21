import type { Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { matchClient, normalizeIdentity } from "../clients/service.ts";
import type { BotQueue } from "./types.ts";

async function findClient(
  tx: Transaction<Database>,
  businessId: string,
  platform: "telegram" | "vk",
  userId: string,
) {
  const identity = await tx
    .selectFrom("client_identity")
    .select("client_id")
    .where("business_id", "=", businessId)
    .where("kind", "=", platform)
    .where("value", "=", userId)
    .executeTakeFirst();
  if (!identity) return null;
  return (
    (await tx
      .selectFrom("client")
      .select(["id", "name", "phone"])
      .where("id", "=", identity.client_id)
      .where("business_id", "=", businessId)
      .executeTakeFirst()) ?? null
  );
}

function profileSummary(name: string | null | undefined, phone: string | null | undefined) {
  const n = name?.trim() && name !== "Клиент" ? name.trim() : "—";
  const p = phone?.trim() || "—";
  return `Ваш профиль:\nИмя: ${n}\nТелефон: ${p}`;
}

/**
 * Customer profile for the messenger bot (name/phone on client row).
 * Never grants admin rights — only edits the caller's own client record.
 */
export async function customerProfileFlow(
  tx: Transaction<Database>,
  input: {
    businessId: string;
    connectionId: string;
    platform: "telegram" | "vk";
    userId: string;
    username?: string;
    eventId: string;
    text: string;
  },
  queue: BotQueue,
) {
  const { businessId, connectionId, platform, userId, eventId, text } = input;
  const table = platform === "telegram" ? "telegram_dialog" : "vk_dialog";
  const state = await tx
    .selectFrom(table)
    .selectAll()
    .where("connection_id", "=", connectionId)
    .where("chat_id", "=", userId)
    .executeTakeFirst();

  if (text !== "Профиль" && !state?.mode.startsWith("profile:")) return false;

  let answers: Record<string, string> = state ? JSON.parse(state.answers) : {};

  const save = async (mode: string) => {
    const row = {
      connection_id: connectionId,
      chat_id: userId,
      mode: "profile:" + mode,
      fields: "[]",
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

  const toMenu = async (message: string) => {
    await tx
      .updateTable(table)
      .set({ mode: "menu", answers: "{}", last_update_id: eventId })
      .where("connection_id", "=", connectionId)
      .where("chat_id", "=", userId)
      .execute();
    await queue(message, ["Главное меню"]);
  };

  const showView = async (prefix = "") => {
    const client = await findClient(tx, businessId, platform, userId);
    const hasData =
      !!client &&
      ((client.name && client.name !== "Клиент") || !!client.phone);
    answers = {};
    await save("view");
    const body =
      (prefix ? prefix + "\n\n" : "") +
      (hasData
        ? profileSummary(client!.name, client!.phone)
        : "Профиль пока пуст. Сохраните имя и телефон для быстрого оформления заказов.");
    await queue(body, [
      hasData ? "Изменить имя" : "Указать имя",
      hasData ? "Изменить телефон" : "Указать телефон",
      ...(hasData ? ["Удалить данные"] : []),
      "Главное меню",
    ]);
  };

  if (text === "Профиль") {
    await showView();
    return true;
  }

  const mode = state?.mode.slice("profile:".length);

  if (mode === "view") {
    if (text === "Изменить имя" || text === "Указать имя") {
      await save("edit_name");
      await queue("Как к вам обращаться?", ["← Назад", "Главное меню"]);
      return true;
    }
    if (text === "Изменить телефон" || text === "Указать телефон") {
      await save("edit_phone");
      await queue("Ваш телефон в формате +79991234567.", [
        "← Назад",
        "Главное меню",
      ]);
      return true;
    }
    if (text === "Удалить данные") {
      await save("confirm_delete");
      await queue("Удалить сохранённые имя и телефон?", [
        "Да, удалить",
        "← Назад",
        "Главное меню",
      ]);
      return true;
    }
    await showView();
    return true;
  }

  if (mode === "edit_name") {
    if (text === "← Назад" || text === "Назад") {
      await showView();
      return true;
    }
    if (!text.trim() || text.length > 100) {
      await queue("Введите имя до 100 символов.", ["← Назад", "Главное меню"]);
      return true;
    }
    const name = text.trim();
    const existing = await findClient(tx, businessId, platform, userId);
    await matchClient(tx, businessId, {
      name,
      phone: existing?.phone ?? null,
      identities: [
        { kind: platform, value: userId, username: input.username },
      ],
    });
    await showView("Имя сохранено.");
    return true;
  }

  if (mode === "edit_phone") {
    if (text === "← Назад" || text === "Назад") {
      await showView();
      return true;
    }
    let phone: string;
    try {
      phone = normalizeIdentity({ kind: "phone", value: text }).value;
    } catch {
      await queue("Введите телефон в формате +79991234567.", [
        "← Назад",
        "Главное меню",
      ]);
      return true;
    }
    const existing = await findClient(tx, businessId, platform, userId);
    await matchClient(tx, businessId, {
      name: existing?.name && existing.name !== "Клиент" ? existing.name : "Клиент",
      phone,
      identities: [
        { kind: platform, value: userId, username: input.username },
      ],
    });
    await showView("Телефон сохранён.");
    return true;
  }

  if (mode === "confirm_delete") {
    if (text === "← Назад" || text === "Назад") {
      await showView();
      return true;
    }
    if (text === "Да, удалить") {
      const client = await findClient(tx, businessId, platform, userId);
      if (client) {
        await tx
          .updateTable("client")
          .set({
            name: "Клиент",
            phone: null,
            updated_at: new Date(),
          })
          .where("id", "=", client.id)
          .where("business_id", "=", businessId)
          .execute();
      }
      await showView("Данные профиля удалены.");
      return true;
    }
    await showView();
    return true;
  }

  await toMenu("Выберите действие.");
  return true;
}

/** Lookup saved customer name/phone for checkout reuse. */
export async function getCustomerProfile(
  tx: Transaction<Database>,
  businessId: string,
  platform: "telegram" | "vk",
  userId: string,
) {
  const client = await findClient(tx, businessId, platform, userId);
  if (!client) return null;
  const name =
    client.name?.trim() && client.name !== "Клиент" ? client.name.trim() : null;
  const phone = client.phone?.trim() || null;
  if (!name || !phone) return null;
  return { name, phone, clientId: client.id };
}
