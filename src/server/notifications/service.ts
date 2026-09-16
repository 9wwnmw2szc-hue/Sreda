import { requireUuid } from "../http/validation.ts";
import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { requireBusiness } from "../access/permissions.ts";
export type NotificationType =
  | "lead.created"
  | "message.received"
  | "booking.created"
  | "booking.cancelled"
  | "booking.rescheduled"
  | "post.failed";
export async function notify(
  tx: Transaction<Database>,
  businessId: string,
  type: NotificationType,
  eventKey: string,
  title: string,
  targetPath: string,
) {
  const row = await tx
    .insertInto("notification")
    .values({
      id: randomUUID(),
      business_id: businessId,
      type,
      event_key: eventKey,
      title,
      target_path: targetPath,
    })
    .onConflict((oc) => oc.columns(["business_id", "event_key"]).doNothing())
    .returning("id")
    .executeTakeFirst();
  if (!row) return;
  const members = await tx
    .selectFrom("business_member")
    .select("user_id")
    .where("business_id", "=", businessId)
    .where("status", "=", "active")
    .execute();
  for (const m of members) {
    const preference = await tx
      .selectFrom("notification_preference")
      .select("enabled")
      .where("business_id", "=", businessId)
      .where("user_id", "=", m.user_id)
      .where("type", "=", type)
      .executeTakeFirst();
    if (preference?.enabled === false) continue;
    await tx
      .insertInto("notification_recipient")
      .values({
        business_id: businessId,
        notification_id: row.id,
        user_id: m.user_id,
        read_at: null,
      })
      .execute();
  }
}
export class NotificationService {
  constructor(private db: Kysely<Database>) {}
  async list(userId: string, publicId: string) {
    const b = await requireBusiness(
      this.db,
      userId,
      publicId,
      "notifications.read",
    );
    return this.db
      .selectFrom("notification as n")
      .innerJoin("notification_recipient as r", "r.notification_id", "n.id")
      .select([
        "n.id",
        "n.type",
        "n.title",
        "n.target_path",
        "n.created_at",
        "r.read_at",
      ])
      .where("n.business_id", "=", b.id)
      .where("r.user_id", "=", userId)
      .orderBy("n.created_at", "desc")
      .limit(100)
      .execute();
  }
  async read(userId: string, publicId: string, id: string) {
    requireUuid(id);
    const b = await requireBusiness(
      this.db,
      userId,
      publicId,
      "notifications.read",
    );
    await this.db
      .updateTable("notification_recipient")
      .set({ read_at: new Date() })
      .where("business_id", "=", b.id)
      .where("user_id", "=", userId)
      .where("notification_id", "=", id)
      .execute();
    return { ok: true };
  }
}
