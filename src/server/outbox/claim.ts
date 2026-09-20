import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { postDeliveryResult } from "../posts/delivery.ts";

type OutboxPlatform = "telegram" | "vk" | "whatsapp" | "instagram";

function outboxTable(platform: OutboxPlatform) {
  if (platform === "telegram") return "telegram_outbox" as const;
  if (platform === "vk") return "vk_outbox" as const;
  return "meta_outbox" as const;
}

/** Commit a delivery lease BEFORE contacting a platform. Never blindly replay an expired lease. */
export async function expireClaims(
  db: Kysely<Database>,
  platform: OutboxPlatform,
) {
  const table = outboxTable(platform);
  await db.transaction().execute(async (tx) => {
    if (table === "meta_outbox") {
      const stale = await tx
        .updateTable("meta_outbox")
        .set({ delivery_state: "uncertain", last_error: "DELIVERY_UNKNOWN" })
        .where("delivery_state", "=", "sending")
        .where("claimed_at", "<", new Date(Date.now() - 300000))
        .returning(["communication_message_id"])
        .execute();
      for (const row of stale) {
        if (row.communication_message_id)
          await tx
            .updateTable("communication_message")
            .set({ delivery_status: "uncertain" })
            .where("id", "=", row.communication_message_id)
            .execute();
      }
      return;
    }
    const stale = await tx
      .updateTable(table)
      .set({ delivery_state: "uncertain", last_error: "DELIVERY_UNKNOWN" })
      .where("delivery_state", "=", "sending")
      .where("claimed_at", "<", new Date(Date.now() - 300000))
      .returning([
        "communication_message_id",
        "post_delivery_id",
        "booking_reminder_id",
        "entity_reminder_id",
      ])
      .execute();
    for (const row of stale) {
      if (row.post_delivery_id)
        await postDeliveryResult(
          tx,
          row.post_delivery_id,
          "uncertain",
          null,
          "DELIVERY_UNKNOWN",
        );
      if (row.booking_reminder_id)
        await tx
          .updateTable("booking_reminder")
          .set({ status: "uncertain" })
          .where("id", "=", row.booking_reminder_id)
          .execute();
      if (row.entity_reminder_id)
        await tx
          .updateTable("entity_reminder")
          .set({ status: "uncertain", last_error: "DELIVERY_UNKNOWN" })
          .where("id", "=", row.entity_reminder_id)
          .where("status", "in", ["queued", "pending"])
          .execute();
      if (row.communication_message_id)
        await tx
          .updateTable("communication_message")
          .set({ delivery_status: "uncertain" })
          .where("id", "=", row.communication_message_id)
          .execute();
    }
  });
}

export async function claimDelivery(
  db: Kysely<Database>,
  platform: OutboxPlatform,
  id: string,
) {
  const table = outboxTable(platform);
  return Boolean(
    await db
      .updateTable(table)
      .set({ delivery_state: "sending", claimed_at: new Date() })
      .where("id", "=", id)
      .where("delivery_state", "=", "pending")
      .where("available_at", "<=", new Date())
      .returning("id")
      .executeTakeFirst(),
  );
}
