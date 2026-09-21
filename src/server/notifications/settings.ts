import { randomBytes, createHash } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { requireBusiness } from "../access/permissions.ts";
import { AppError } from "../http/errors.ts";
import { claimStaffProviderIdentity } from "./staff-destination.ts";

export const notificationTypes = [
  "lead.created",
  "message.received",
  "booking.created",
  "booking.cancelled",
  "booking.rescheduled",
  "booking.upcoming",
  "order.created",
  "post.failed",
  "calendar.reminder",
  "inventory.low_stock",
];

type StaffPlatform = "telegram" | "vk";

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

function platformOf(value: unknown): StaffPlatform {
  if (value === "vk") return "vk";
  return "telegram";
}

export class NotificationSettings {
  constructor(private db: Kysely<Database>) {}

  async get(user: string, publicId: string) {
    const b = await requireBusiness(
      this.db,
      user,
      publicId,
      "notifications.read",
    );
    const bindings = await this.db
      .selectFrom("notification_binding")
      .select(["platform", "chat_id"])
      .where("business_id", "=", b.id)
      .where("user_id", "=", user)
      .execute();
    const members = await this.db
      .selectFrom("business_member as m")
      .innerJoin("user as u", "u.id", "m.user_id")
      .select(["u.id", "u.name"])
      .where("m.business_id", "=", b.id)
      .where("m.status", "=", "active")
      .execute();
    const preferences = await this.db
      .selectFrom("notification_preference")
      .select(["user_id", "type", "enabled"])
      .where("business_id", "=", b.id)
      .execute();
    const telegram = bindings.find((x) => x.platform === "telegram");
    const vk = bindings.find((x) => x.platform === "vk");
    return {
      connected: !!telegram?.chat_id,
      telegramConnected: !!telegram?.chat_id,
      vkConnected: !!vk?.chat_id,
      canManage: b.role !== "operator",
      members:
        b.role === "operator" ? members.filter((m) => m.id === user) : members,
      preferences:
        b.role === "operator"
          ? preferences.filter((p) => p.user_id === user)
          : preferences,
      types: notificationTypes,
    };
  }

  async save(user: string, publicId: string, body: Record<string, unknown>) {
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(
        tx,
        user,
        publicId,
        body.action === "preferences"
          ? "settings.manage"
          : "notifications.read",
      );
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(
        tx,
        user,
        publicId,
        body.action === "preferences"
          ? "settings.manage"
          : "notifications.read",
      );
      const platform = platformOf(body.platform);
      if (body.action === "disconnect") {
        await tx
          .deleteFrom("notification_binding")
          .where("business_id", "=", b.id)
          .where("user_id", "=", user)
          .where("platform", "=", platform)
          .execute();
        return { ok: true };
      }
      if (body.action === "preferences") {
        const uid = String(body.user_id),
          type = String(body.type);
        if (
          !notificationTypes.includes(type) ||
          typeof body.enabled !== "boolean" ||
          !(await tx
            .selectFrom("business_member")
            .select("user_id")
            .where("business_id", "=", b.id)
            .where("user_id", "=", uid)
            .where("status", "=", "active")
            .executeTakeFirst())
        )
          throw new AppError(
            400,
            "INVALID_RECIPIENT",
            "Проверьте сотрудника и событие.",
          );
        await tx
          .insertInto("notification_preference")
          .values({
            business_id: b.id,
            user_id: uid,
            type,
            enabled: body.enabled,
          })
          .onConflict((oc) =>
            oc
              .columns(["business_id", "user_id", "type"])
              .doUpdateSet({ enabled: body.enabled as boolean }),
          )
          .execute();
        return { ok: true };
      }
      if (body.action !== "connect")
        throw new AppError(400, "INVALID_ACTION", "Действие недоступно.");

      let connectionId: string | undefined;
      if (platform === "telegram") {
        const connection = await tx
          .selectFrom("business_connection as c")
          .innerJoin("telegram_runtime as r", "r.connection_id", "c.id")
          .select("c.id")
          .where("c.business_id", "=", b.id)
          .where("c.platform", "=", "telegram")
          .where("c.status", "=", "connected")
          .where("r.status", "=", "ready")
          .executeTakeFirst();
        connectionId = connection?.id;
      } else {
        const connection = await tx
          .selectFrom("business_connection as c")
          .innerJoin("vk_runtime as r", "r.connection_id", "c.id")
          .select("c.id")
          .where("c.business_id", "=", b.id)
          .where("c.platform", "=", "vk")
          .where("c.status", "=", "connected")
          .where("r.status", "=", "ready")
          .executeTakeFirst();
        connectionId = connection?.id;
      }
      if (!connectionId)
        throw new AppError(
          409,
          "CONNECTION_REQUIRED",
          platform === "telegram"
            ? "Сначала запустите Telegram-бота бизнеса."
            : "Сначала подключите и запустите VK-сообщество бизнеса.",
        );
      const code = randomBytes(24).toString("base64url");
      await tx
        .insertInto("notification_binding")
        .values({
          business_id: b.id,
          user_id: user,
          platform,
          connection_id: connectionId,
          chat_id: null,
          code_hash: hash(code),
          expires_at: new Date(Date.now() + 600000),
        })
        .onConflict((oc) =>
          oc
            .columns(["business_id", "user_id", "platform"])
            .doUpdateSet({
              connection_id: connectionId!,
              chat_id: null,
              code_hash: hash(code),
              expires_at: new Date(Date.now() + 600000),
            }),
        )
        .execute();
      return {
        command:
          platform === "telegram"
            ? "/start notify_" + code
            : "notify_" + code,
        platform,
        expiresIn: 600,
      };
    });
  }
}

export async function bindNotification(
  tx: Transaction<Database>,
  businessId: string,
  connectionId: string,
  chatId: string,
  code: string,
) {
  if (!/^[\w-]{32}$/.test(code)) return false;
  if (!chatId || chatId.length > 64) return false;
  const connection = await tx
    .selectFrom("business_connection")
    .select(["id", "platform"])
    .where("business_id", "=", businessId)
    .where("id", "=", connectionId)
    .where("status", "=", "connected")
    .executeTakeFirst();
  if (
    !connection ||
    (connection.platform !== "telegram" && connection.platform !== "vk")
  )
    return false;
  const platform = connection.platform as StaffPlatform;
  const row = await tx
    .selectFrom("notification_binding as n")
    .innerJoin("business_member as m", (j) =>
      j
        .onRef("m.business_id", "=", "n.business_id")
        .onRef("m.user_id", "=", "n.user_id"),
    )
    .select("n.user_id")
    .where("n.business_id", "=", businessId)
    .where("n.connection_id", "=", connectionId)
    .where("n.platform", "=", platform)
    .where("n.code_hash", "=", hash(code))
    .where("n.expires_at", ">", new Date())
    .where("m.status", "=", "active")
    .executeTakeFirst();
  if (!row) return false;
  const bound = await tx
    .selectFrom("notification_binding")
    .select("user_id")
    .where("connection_id", "=", connectionId)
    .where("chat_id", "=", chatId)
    .where("platform", "=", platform)
    .executeTakeFirst();
  if (bound && bound.user_id !== row.user_id) return false;

  // Explicit User claim for this messenger identity — never treat a customer chat
  // as staff merely because it interacted with the business bot.
  const claimed = await claimStaffProviderIdentity(tx, {
    userId: row.user_id,
    platform,
    externalUserId: chatId,
  });
  if (!claimed.ok) return false;

  await tx
    .updateTable("notification_binding")
    .set({ chat_id: chatId, code_hash: null, expires_at: null })
    .where("business_id", "=", businessId)
    .where("user_id", "=", row.user_id)
    .where("platform", "=", platform)
    .execute();
  return true;
}
