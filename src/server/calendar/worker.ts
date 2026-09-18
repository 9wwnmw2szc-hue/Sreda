import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { notify, type NotificationType } from "../notifications/service.ts";

function reminderTitle(kind: string, title: string, template: string): string {
  if (template.trim()) return template.trim().slice(0, 500);
  if (kind === "booking") return "Скоро запись: " + title;
  if (kind === "order") return "Напоминание о заказе: " + title;
  if (kind === "lead") return "Напоминание о заявке: " + title;
  return "Напоминание: " + title;
}

function targetPath(kind: string, entityId: string): string {
  if (kind === "booking") return "/bookings?id=" + entityId;
  if (kind === "order") return "/orders?id=" + entityId;
  if (kind === "lead") return "/leads?id=" + entityId;
  return "/calendar?id=" + entityId;
}

function notificationType(kind: string): NotificationType {
  return kind === "booking" ? "booking.upcoming" : "calendar.reminder";
}

async function loadEntity(
  tx: Transaction<Database>,
  businessId: string,
  kind: string,
  entityId: string,
): Promise<{ title: string; startsAt: Date | null; alive: boolean } | null> {
  if (kind === "calendar_event") {
    const row = await tx
      .selectFrom("calendar_event")
      .select(["title", "starts_at", "status"])
      .where("business_id", "=", businessId)
      .where("id", "=", entityId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      title: row.title,
      startsAt: row.starts_at,
      alive: row.status !== "cancelled",
    };
  }
  if (kind === "booking") {
    const row = await tx
      .selectFrom("booking as k")
      .innerJoin("booking_service as s", "s.id", "k.service_id")
      .select(["s.name as title", "k.starts_at", "k.status"])
      .where("k.business_id", "=", businessId)
      .where("k.id", "=", entityId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      title: row.title,
      startsAt: row.starts_at,
      alive: ["pending", "confirmed"].includes(row.status),
    };
  }
  if (kind === "order") {
    const row = await tx
      .selectFrom("order")
      .select(["id", "status", "order_number"])
      .where("business_id", "=", businessId)
      .where("id", "=", entityId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      title: row.order_number != null ? "Заказ №" + row.order_number : "Заказ",
      startsAt: null,
      alive: !["cancelled", "completed"].includes(String(row.status)),
    };
  }
  if (kind === "lead") {
    const row = await tx
      .selectFrom("lead")
      .select(["name", "status"])
      .where("business_id", "=", businessId)
      .where("id", "=", entityId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      title: row.name,
      startsAt: null,
      alive: !["completed", "rejected", "closed"].includes(row.status),
    };
  }
  return null;
}

async function markReminder(
  tx: Transaction<Database>,
  id: string,
  status: "queued" | "sent" | "failed" | "cancelled",
  lastError: string | null = null,
) {
  await tx
    .updateTable("entity_reminder")
    .set({ status, last_error: lastError })
    .where("id", "=", id)
    .where("status", "=", "pending")
    .execute();
}

async function queueClientChannel(
  tx: Transaction<Database>,
  reminder: {
    id: string;
    business_id: string;
    entity_id: string;
  },
  platform: "telegram" | "vk",
  title: string,
): Promise<"queued" | "failed"> {
  const booking = await tx
    .selectFrom("booking")
    .select("client_id")
    .where("id", "=", reminder.entity_id)
    .where("business_id", "=", reminder.business_id)
    .executeTakeFirst();
  if (!booking) return "failed";
  const identity = await tx
    .selectFrom("client_identity")
    .select("value")
    .where("business_id", "=", reminder.business_id)
    .where("client_id", "=", booking.client_id)
    .where("kind", "=", platform)
    .executeTakeFirst();
  if (!identity) return "failed";
  const connection = await tx
    .selectFrom("business_connection")
    .select("id")
    .where("business_id", "=", reminder.business_id)
    .where("platform", "=", platform)
    .where("status", "=", "connected")
    .executeTakeFirst();
  if (!connection) return "failed";
  const runtime =
    platform === "telegram"
      ? await tx
          .selectFrom("telegram_runtime")
          .select("status")
          .where("connection_id", "=", connection.id)
          .executeTakeFirst()
      : await tx
          .selectFrom("vk_runtime")
          .select("status")
          .where("connection_id", "=", connection.id)
          .executeTakeFirst();
  if (runtime?.status !== "ready") return "failed";
  const row = {
    connection_id: connection.id,
    message: title,
    entity_reminder_id: reminder.id,
    delivered_at: null,
    last_error: null,
  };
  if (platform === "telegram")
    await tx
      .insertInto("telegram_outbox")
      .values({ ...row, chat_id: identity.value })
      .onConflict((oc) => oc.column("entity_reminder_id").doNothing())
      .execute();
  else
    await tx
      .insertInto("vk_outbox")
      .values({ ...row, peer_id: identity.value })
      .onConflict((oc) => oc.column("entity_reminder_id").doNothing())
      .execute();
  return "queued";
}

async function queueStaffChannel(
  tx: Transaction<Database>,
  reminder: {
    id: string;
    business_id: string;
    recipient_user_id: string | null;
  },
  platform: "telegram" | "vk",
  title: string,
): Promise<"queued" | "failed"> {
  if (!reminder.recipient_user_id) return "failed";
  const binding = await tx
    .selectFrom("notification_binding")
    .select(["connection_id", "chat_id", "platform"])
    .where("business_id", "=", reminder.business_id)
    .where("user_id", "=", reminder.recipient_user_id)
    .where("platform", "=", platform)
    .executeTakeFirst();
  if (!binding?.chat_id) return "failed";
  const connection = await tx
    .selectFrom("business_connection")
    .select("id")
    .where("id", "=", binding.connection_id)
    .where("business_id", "=", reminder.business_id)
    .where("platform", "=", platform)
    .where("status", "=", "connected")
    .executeTakeFirst();
  if (!connection) return "failed";
  const runtime =
    platform === "telegram"
      ? await tx
          .selectFrom("telegram_runtime")
          .select("status")
          .where("connection_id", "=", connection.id)
          .executeTakeFirst()
      : await tx
          .selectFrom("vk_runtime")
          .select("status")
          .where("connection_id", "=", connection.id)
          .executeTakeFirst();
  if (runtime?.status !== "ready") return "failed";
  if (platform === "telegram") {
    await tx
      .insertInto("telegram_outbox")
      .values({
        connection_id: binding.connection_id,
        chat_id: binding.chat_id,
        message: title,
        entity_reminder_id: reminder.id,
        delivered_at: null,
        last_error: null,
      })
      .onConflict((oc) => oc.column("entity_reminder_id").doNothing())
      .execute();
  } else {
    await tx
      .insertInto("vk_outbox")
      .values({
        connection_id: binding.connection_id,
        peer_id: binding.chat_id,
        message: title,
        entity_reminder_id: reminder.id,
        delivered_at: null,
        last_error: null,
      })
      .onConflict((oc) => oc.column("entity_reminder_id").doNothing())
      .execute();
  }
  return "queued";
}

export async function processEntityReminder(db: Kysely<Database>) {
  const candidate = await db
    .selectFrom("entity_reminder as r")
    .innerJoin("business as b", "b.id", "r.business_id")
    .select(["r.id", "r.business_id"])
    .where("b.archived_at", "is", null)
    .where("r.status", "=", "pending")
    .where("r.fire_at", "<=", new Date())
    .orderBy("r.fire_at")
    .executeTakeFirst();
  if (!candidate) return false;
  return db.transaction().execute(async (tx) => {
    await tx
      .selectFrom("business")
      .select("id")
      .where("id", "=", candidate.business_id)
      .forUpdate()
      .execute();
    const reminder = await tx
      .selectFrom("entity_reminder")
      .selectAll()
      .where("id", "=", candidate.id)
      .where("status", "=", "pending")
      .forUpdate()
      .executeTakeFirst();
    if (!reminder) return false;
    const entity = await loadEntity(
      tx,
      reminder.business_id,
      reminder.entity_kind,
      reminder.entity_id,
    );
    if (!entity?.alive) {
      await markReminder(tx, reminder.id, "cancelled");
      return true;
    }
    if (entity.startsAt && +entity.startsAt <= Date.now()) {
      await markReminder(tx, reminder.id, "cancelled");
      return true;
    }
    const title = reminderTitle(
      reminder.entity_kind,
      entity.title,
      reminder.message_template,
    );
    const path = targetPath(reminder.entity_kind, reminder.entity_id);
    const type = notificationType(reminder.entity_kind);

    if (reminder.channel === "in_app") {
      if (reminder.audience !== "staff") {
        await markReminder(
          tx,
          reminder.id,
          "failed",
          "IN_APP_CLIENT_UNSUPPORTED",
        );
        return true;
      }
      await notify(
        tx,
        reminder.business_id,
        type,
        "entity-reminder:" + reminder.id,
        title,
        path,
        reminder.recipient_user_id ? [reminder.recipient_user_id] : undefined,
      );
      await markReminder(tx, reminder.id, "sent");
      return true;
    }

    if (reminder.channel !== "telegram" && reminder.channel !== "vk") {
      await markReminder(tx, reminder.id, "failed", "UNSUPPORTED_CHANNEL");
      return true;
    }

    const platform = reminder.channel;
    let outcome: "queued" | "failed" = "failed";
    let error = "NO_READY_DELIVERY_PATH";

    if (reminder.audience === "client" && reminder.entity_kind === "booking") {
      outcome = await queueClientChannel(tx, reminder, platform, title);
      if (outcome === "failed")
        error =
          platform === "telegram"
            ? "NO_READY_CLIENT_TELEGRAM"
            : "NO_READY_CLIENT_VK";
    } else if (reminder.recipient_user_id) {
      outcome = await queueStaffChannel(tx, reminder, platform, title);
      if (outcome === "failed")
        error =
          platform === "telegram"
            ? "NO_READY_STAFF_TELEGRAM_BINDING"
            : "NO_READY_STAFF_VK_BINDING";
    } else {
      error = "MISSING_RECIPIENT";
    }

    if (outcome === "queued") await markReminder(tx, reminder.id, "queued");
    else await markReminder(tx, reminder.id, "failed", error);
    return true;
  });
}

export async function entityReminderValid(
  tx: Transaction<Database>,
  reminderId: string,
) {
  const reminder = await tx
    .selectFrom("entity_reminder")
    .select(["status", "entity_kind", "entity_id", "business_id"])
    .where("id", "=", reminderId)
    .executeTakeFirst();
  if (!reminder) return false;
  if (!["pending", "queued", "uncertain"].includes(reminder.status))
    return false;
  const entity = await loadEntity(
    tx,
    reminder.business_id,
    reminder.entity_kind,
    reminder.entity_id,
  );
  return !!entity?.alive;
}
