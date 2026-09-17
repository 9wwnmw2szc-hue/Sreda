import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
export async function queueBookingReminder(db: Kysely<Database>) {
  const candidate = await db
    .selectFrom("booking_reminder as r")
    .innerJoin("business as b", "b.id", "r.business_id")
    .select(["r.id", "r.business_id"])
    .where("b.archived_at", "is", null)
    .where("r.status", "=", "pending")
    .where("r.due_at", "<=", new Date())
    .orderBy("r.due_at")
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
      .selectFrom("booking_reminder")
      .selectAll()
      .where("id", "=", candidate.id)
      .where("status", "=", "pending")
      .forUpdate()
      .executeTakeFirst();
    if (!reminder) return false;
    const booking = await tx
      .selectFrom("booking as k")
      .innerJoin("business as b", "b.id", "k.business_id")
      .innerJoin("booking_service as s", "s.id", "k.service_id")
      .innerJoin("booking_specialist as r", "r.id", "k.specialist_id")
      .selectAll("k")
      .select([
        "b.timezone",
        "b.name",
        "b.public_name",
        "s.name as service_name",
        "r.name as specialist_name",
      ])
      .where("k.id", "=", reminder.booking_id)
      .executeTakeFirstOrThrow();
    if (
      booking.status !== "confirmed" ||
      booking.revision !== reminder.revision ||
      +booking.starts_at <= Date.now()
    ) {
      await tx
        .updateTable("booking_reminder")
        .set({ status: "cancelled" })
        .where("id", "=", reminder.id)
        .execute();
      return true;
    }
    const identities = await tx
      .selectFrom("client_identity")
      .selectAll()
      .where("business_id", "=", booking.business_id)
      .where("client_id", "=", booking.client_id)
      .where("kind", "in", ["telegram", "vk"])
      .execute();
    for (const identity of identities) {
      const platform = identity.kind as "telegram" | "vk";
      const connection = await tx
        .selectFrom("business_connection")
        .select("id")
        .where("business_id", "=", booking.business_id)
        .where("platform", "=", platform)
        .where("status", "=", "connected")
        .executeTakeFirst();
      if (!connection) continue;
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
      if (runtime?.status !== "ready") continue;
      const message = `${reminder.kind === "confirmation" ? "Вы записаны" : "Напоминаем о записи"} в ${booking.public_name || booking.name}\n${booking.service_name}\n${booking.specialist_name}\n${booking.starts_at.toLocaleString("ru", { timeZone: booking.timezone })}`;
      const row = {
        connection_id: connection.id,
        message,
        booking_reminder_id: reminder.id,
        buttons: JSON.stringify([
          "Перенести " + booking.id.slice(0, 8),
          "Отменить " + booking.id.slice(0, 8),
          "Мои записи",
        ]),
        delivered_at: null,
        last_error: null,
      };
      if (platform === "telegram")
        await tx
          .insertInto("telegram_outbox")
          .values({ ...row, chat_id: identity.value })
          .onConflict((oc) => oc.column("booking_reminder_id").doNothing())
          .execute();
      else
        await tx
          .insertInto("vk_outbox")
          .values({ ...row, peer_id: identity.value })
          .onConflict((oc) => oc.column("booking_reminder_id").doNothing())
          .execute();
      await tx
        .updateTable("booking_reminder")
        .set({ status: "queued" })
        .where("id", "=", reminder.id)
        .execute();
      return true;
    }
    await tx
      .updateTable("booking_reminder")
      .set({ status: "failed", last_error: "NO_READY_CLIENT_CHANNEL" })
      .where("id", "=", reminder.id)
      .execute();
    return true;
  });
}
export async function reminderValid(tx: Transaction<Database>, id: string) {
  const r = await tx
    .selectFrom("booking_reminder as r")
    .innerJoin("booking as b", "b.id", "r.booking_id")
    .select([
      "r.status",
      "r.revision",
      "b.revision as currentRevision",
      "b.status as bookingStatus",
      "b.starts_at",
    ])
    .where("r.id", "=", id)
    .executeTakeFirst();
  return (
    !!r &&
    r.status === "queued" &&
    r.revision === r.currentRevision &&
    r.bookingStatus === "confirmed" &&
    +r.starts_at > Date.now()
  );
}
