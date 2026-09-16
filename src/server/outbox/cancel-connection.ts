import type { Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { postDeliveryResult } from "../posts/delivery.ts";
export async function cancelConnectionDeliveries(
  tx: Transaction<Database>,
  connectionId: string,
) {
  await tx
    .updateTable("post_target")
    .set({ active: false })
    .where("connection_id", "=", connectionId)
    .execute();
  await tx
    .deleteFrom("notification_binding")
    .where("connection_id", "=", connectionId)
    .execute();
  for (const table of ["telegram_outbox", "vk_outbox"] as const) {
    const pending = await tx
      .selectFrom(table)
      .select([
        "communication_message_id",
        "booking_reminder_id",
        "post_delivery_id",
        "delivery_state",
      ])
      .where("connection_id", "=", connectionId)
      .where("delivered_at", "is", null)
      .execute();
    for (const row of pending) {
      const state = ["sending", "uncertain"].includes(row.delivery_state)
        ? "uncertain"
        : "failed";
      if (row.communication_message_id)
        await tx
          .updateTable("communication_message")
          .set({ delivery_status: state })
          .where("id", "=", row.communication_message_id)
          .execute();
      if (row.booking_reminder_id)
        await tx
          .updateTable("booking_reminder")
          .set({ status: state, last_error: "CONNECTION_REMOVED" })
          .where("id", "=", row.booking_reminder_id)
          .execute();
      if (row.post_delivery_id)
        await postDeliveryResult(
          tx,
          row.post_delivery_id,
          state,
          null,
          "CONNECTION_REMOVED",
        );
    }
  }
}
