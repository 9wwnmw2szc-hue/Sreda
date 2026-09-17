import { postDeliveryResult } from "../posts/delivery.ts";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
/** Commit a delivery lease BEFORE contacting a platform. Never blindly replay an expired lease. */
export async function expireClaims(
  db: Kysely<Database>,
  platform: "telegram" | "vk",
) {
  const table = platform === "telegram" ? "telegram_outbox" : "vk_outbox";
  await db.transaction().execute(async (tx) => {
    const stale = await tx
      .updateTable(table)
      .set({ delivery_state: "uncertain", last_error: "DELIVERY_UNKNOWN" })
      .where("delivery_state", "=", "sending")
      .where("claimed_at", "<", new Date(Date.now() - 300000))
      .returning([
        "communication_message_id",
        "post_delivery_id",
        "booking_reminder_id",
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
  platform: "telegram" | "vk",
  id: string,
) {
  const table = platform === "telegram" ? "telegram_outbox" : "vk_outbox";
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
