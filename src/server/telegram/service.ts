import { autopostEnabled } from "../posts/availability.ts";
import { limit } from "../http/limits.ts";
import { notificationValid } from "../notifications/worker.ts";
import { sendTelegramMedia } from "../attachments/send.ts";
import { telegramAttachments } from "../attachments/inbound.ts";
import { postDeliveryResult } from "../posts/delivery.ts";
import { reminderValid } from "../booking/worker.ts";
import { claimDelivery, expireClaims } from "../outbox/claim.ts";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { decryptSecret } from "../connections/crypto.ts";
import { routeBot } from "../bot/router.ts";
import { SolutionService } from "../solutions/service.ts";
import { telegramCall, TelegramError } from "./api.ts";
import { CommunicationService } from "../communications/service.ts";
export function webhookSecret(secret: string, id: string, generation: string) {
  return createHmac("sha256", secret)
    .update("telegram-webhook:" + id + ":" + generation)
    .digest("hex");
}
export class TelegramService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly secret: string,
    private readonly origin: string,
    private readonly enabled: boolean,
    private readonly transport: typeof fetch = fetch,
    private readonly communications?: CommunicationService,
  ) {}
  async start(userId: string, publicId: string) {
    if (!this.enabled)
      throw new AppError(
        503,
        "TELEGRAM_DISABLED",
        "Запуск Telegram станет доступен после подготовки сервера.",
      );
    let affected: string | undefined;
    try {
      return await this.db.transaction().execute(async (tx) => {
        const solutions = new SolutionService(tx, true);
        const businessId = await solutions.business(userId, publicId, true);
        await tx
          .selectFrom("business")
          .select("id")
          .where("id", "=", businessId)
          .forUpdate()
          .execute();
        await solutions.business(userId, publicId, true);
        const { draft } = await solutions.get(userId, publicId);
        const enabled = await tx
          .selectFrom("business_solution")
          .select("solution_code")
          .where("business_id", "=", businessId)
          .where("status", "in", ["active", "trial"])
          .execute();
        if (
          !(draft.step === 3 && draft.channels.includes("telegram")) &&
          !enabled.some((s) =>
            ["booking", "admin_messages", "autopost"].includes(s.solution_code),
          )
        )
          throw new AppError(
            400,
            "SETUP_REQUIRED",
            "Настройте хотя бы одно решение бизнеса.",
          );
        const connection = await tx
          .selectFrom("business_connection as c")
          .innerJoin("connection_secret as s", "s.connection_id", "c.id")
          .select(["c.id", "s.encrypted_token"])
          .where("c.business_id", "=", businessId)
          .where("c.platform", "=", "telegram")
          .where("c.status", "=", "connected")
          .executeTakeFirst();
        if (!connection)
          throw new AppError(
            400,
            "CONNECTION_REQUIRED",
            "Сначала подключите Telegram-бота в разделе «Подключения».",
          );
        affected = connection.id;
        const generation = randomUUID();
        await tx
          .insertInto("telegram_runtime")
          .values({
            connection_id: connection.id,
            generation,
            status: "pending",
          })
          .onConflict((oc) =>
            oc.column("connection_id").doUpdateSet({
              generation,
              status: "pending",
              updated_at: new Date(),
            }),
          )
          .execute();
        // Do not discard Telegram's pending updates. Failed DB commit leaves webhook
        // requests unacknowledged until configuration is retried with a new secret.
        await telegramCall(
          decryptSecret(connection.encrypted_token, this.secret),
          "setWebhook",
          {
            url: this.origin + "/api/telegram/" + connection.id,
            secret_token: webhookSecret(this.secret, connection.id, generation),
            allowed_updates: ["message"],
            max_connections: 1,
          },
          this.transport,
        );
        await tx
          .updateTable("telegram_runtime")
          .set({ status: "ready", updated_at: new Date() })
          .where("connection_id", "=", connection.id)
          .execute();
        return { ok: true };
      });
    } catch (error) {
      // Telegram and PostgreSQL cannot share a transaction. Never keep a previous
      // ready flag after an uncertain remote update or local commit failure.
      if (affected)
        await this.db
          .updateTable("telegram_runtime")
          .set({ status: "error", updated_at: new Date() })
          .where("connection_id", "=", affected)
          .execute();
      throw error;
    }
  }
  async receive(id: string, provided: string, body: Record<string, unknown>) {
    if (!this.enabled)
      throw new AppError(
        503,
        "TELEGRAM_DISABLED",
        "Обработка сообщений временно недоступна.",
      );
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        id,
      )
    )
      throw new AppError(404, "NOT_FOUND", "Подключение не найдено.");
    return this.db.transaction().execute(async (tx) => {
      const lookup = await tx
        .selectFrom("business_connection")
        .select("business_id")
        .where("id", "=", id)
        .executeTakeFirst();
      if (!lookup)
        throw new AppError(404, "NOT_FOUND", "Подключение не найдено.");
      const business = await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", lookup.business_id)
        .where("archived_at", "is", null)
        .forUpdate()
        .executeTakeFirst();
      const c = await tx
        .selectFrom("business_connection as c")
        .innerJoin("telegram_runtime as r", "r.connection_id", "c.id")
        .innerJoin("connection_secret as s", "s.connection_id", "c.id")
        .select(["r.generation", "r.status", "c.external_account_id"])
        .where("c.id", "=", id)
        .where("c.status", "=", "connected")
        .where("c.platform", "=", "telegram")
        .executeTakeFirst();
      const expected = c ? webhookSecret(this.secret, id, c.generation) : "";
      if (
        !business ||
        !c ||
        !expected ||
        !/^[a-f0-9]{64}$/.test(provided) ||
        !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
      )
        throw new AppError(403, "INVALID_WEBHOOK", "Запрос не подтверждён.");
      if (c.status !== "ready")
        throw new AppError(
          503,
          "CHANNEL_PAUSED",
          "Обработка временно приостановлена.",
        );
      if (!Number.isSafeInteger(body.update_id) || Number(body.update_id) < 0)
        throw new AppError(400, "INVALID_UPDATE", "Некорректное событие.");
      const updateId = String(body.update_id);
      const unique = await tx
        .insertInto("telegram_update")
        .values({ connection_id: id, update_id: updateId })
        .onConflict((oc) =>
          oc.columns(["connection_id", "update_id"]).doNothing(),
        )
        .returning("update_id")
        .executeTakeFirst();
      if (!unique) return { ok: true };
      const m = body.message as
        | {
            chat?: { id?: number; type?: string };
            from?: { id?: number; is_bot?: boolean; username?: string };
            text?: string;
            caption?: string;
          }
        | undefined;
      if (
        m?.chat?.type !== "private" ||
        !Number.isSafeInteger(m.chat.id) ||
        m.from?.id !== m.chat.id ||
        m.from?.is_bot
      )
        return { ok: true };
      await limit(tx, this.secret, "bot:" + id + ":" + m.chat.id, 30, 60);
      await routeBot(tx, {
        businessId: business.id,
        connectionId: id,
        platform: "telegram",
        userId: String(m.chat.id),
        username: m.from?.username,
        eventId: updateId,
        text: m.text ?? m.caption ?? "",
        attachments: telegramAttachments(body.message),
      });
      return { ok: true };
    });
  }
  async deliverOne() {
    if (!this.enabled) return false;
    await this.db
      .insertInto("worker_heartbeat")
      .values({ name: "telegram", seen_at: new Date() })
      .onConflict((oc) =>
        oc.column("name").doUpdateSet({ seen_at: new Date() }),
      )
      .execute();
    await expireClaims(this.db, "telegram");
    const candidate = await this.db
      .selectFrom("telegram_outbox as o")
      .innerJoin("business_connection as c", "c.id", "o.connection_id")
      .innerJoin("business as b", "b.id", "c.business_id")
      .where("b.archived_at", "is", null)
      .innerJoin("telegram_runtime as r", "r.connection_id", "c.id")
      .innerJoin(
        "connection_secret as credential",
        "credential.connection_id",
        "c.id",
      )
      .select(["o.id", "c.business_id"])
      .where("c.status", "=", "connected")
      .where("o.delivery_state", "=", "pending")
      .where("o.delivered_at", "is", null)
      .where("o.attempts", "<", 8)
      .where("o.available_at", "<=", new Date())
      .where("r.status", "=", "ready")
      .where(
        sql<boolean>`not exists(select 1 from telegram_outbox previous where previous.connection_id=o.connection_id and previous.chat_id=o.chat_id and previous.id<o.id and previous.delivered_at is null and previous.delivery_state in ('pending','sending'))`,
      )
      .where(
        sql<boolean>`(o.post_delivery_id is null or exists(select 1 from post_delivery d join business_solution s on s.business_id=d.business_id where d.id=o.post_delivery_id and d.status='publishing' and s.solution_code='autopost' and s.status in ('active','trial') and (s.expires_at is null or s.expires_at > now())))`,
      )
      .orderBy("o.id")
      .executeTakeFirst();
    if (!candidate) return false;
    if (!(await claimDelivery(this.db, "telegram", candidate.id))) return false;
    return this.db.transaction().execute(async (tx) => {
      const business = await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", candidate.business_id)
        .where("archived_at", "is", null)
        .forUpdate()
        .executeTakeFirst();
      if (!business) {
        await tx
          .updateTable("telegram_outbox")
          .set({ delivery_state: "pending", claimed_at: null })
          .where("id", "=", candidate.id)
          .where("delivery_state", "=", "sending")
          .execute();
        return false;
      }
      const row = await tx
        .selectFrom("telegram_outbox")
        .selectAll()
        .where("id", "=", candidate.id)
        .where("delivery_state", "=", "sending")
        .where("delivered_at", "is", null)
        .where("available_at", "<=", new Date())
        .forUpdate()
        .executeTakeFirst();
      if (!row) return false;
      if (
        row.post_delivery_id &&
        !(await autopostEnabled(tx, candidate.business_id))
      ) {
        // No provider call has happened: safely release this lease until reactivation.
        await tx
          .updateTable("telegram_outbox")
          .set({ delivery_state: "pending", claimed_at: null })
          .where("id", "=", row.id)
          .execute();
        return false;
      }
      const connection = await tx
        .selectFrom("connection_secret as s")
        .innerJoin(
          "telegram_runtime as r",
          "r.connection_id",
          "s.connection_id",
        )
        .innerJoin("business_connection as c", "c.id", "s.connection_id")
        .select("s.encrypted_token")
        .where("s.connection_id", "=", row.connection_id)
        .where("r.status", "=", "ready")
        .where("c.status", "=", "connected")
        .executeTakeFirst();
      if (!connection) {
        await tx
          .updateTable("telegram_outbox")
          .set({ delivery_state: "pending", claimed_at: null })
          .where("id", "=", candidate.id)
          .where("delivery_state", "=", "sending")
          .execute();
        return false;
      }
      if (
        row.notification_id &&
        (!row.notification_user_id ||
          !(await notificationValid(
            tx,
            row.notification_id,
            row.notification_user_id,
            row.connection_id,
            row.chat_id,
          )))
      ) {
        await tx
          .updateTable("telegram_outbox")
          .set({
            delivery_state: "failed",
            last_error: "RECIPIENT_UNAVAILABLE",
          })
          .where("id", "=", row.id)
          .execute();
        return true;
      }
      if (
        row.booking_reminder_id &&
        !(await reminderValid(tx, row.booking_reminder_id))
      ) {
        await tx
          .updateTable("telegram_outbox")
          .set({ delivery_state: "failed", last_error: "STALE_REMINDER" })
          .where("id", "=", row.id)
          .execute();
        return true;
      }
      try {
        const delivered = await sendTelegramMedia(
          tx,
          this.secret,
          business.id,
          decryptSecret(connection.encrypted_token, this.secret),
          row.chat_id,
          row.message,
          row.attachment_ids as string[],
          row.post_delivery_id
            ? (row.api_payload as Record<string, unknown>)
            : {
                reply_markup: {
                  keyboard: (row.buttons as string[]).map((text) => [{ text }]),
                  resize_keyboard: true,
                },
              },
          this.transport,
        );
        await tx
          .updateTable("telegram_outbox")
          .set({
            delivery_state: "sent",
            external_message_id: delivered?.message_id
              ? String(delivered.message_id)
              : null,
            delivered_at: new Date(),
            message: "",
            last_error: null,
          })
          .where("id", "=", row.id)
          .execute();
        if (row.post_delivery_id)
          await postDeliveryResult(
            tx,
            row.post_delivery_id,
            "published",
            delivered?.message_id ? String(delivered.message_id) : null,
          );
        if (row.booking_reminder_id)
          await tx
            .updateTable("booking_reminder")
            .set({ status: "sent" })
            .where("id", "=", row.booking_reminder_id)
            .execute();
        if (row.communication_message_id) {
          const remaining = await tx
            .selectFrom("telegram_outbox")
            .select("id")
            .where(
              "communication_message_id",
              "=",
              row.communication_message_id,
            )
            .where("delivery_state", "!=", "sent")
            .executeTakeFirst();
          if (!remaining)
            await tx
              .updateTable("communication_message")
              .set({
                delivery_status: "sent",
                external_message_id: delivered?.message_id
                  ? `telegram:${row.connection_id}:${row.chat_id}:${delivered.message_id}`
                  : null,
              })
              .where("id", "=", row.communication_message_id)
              .execute();
        }
      } catch (e) {
        if (!(e instanceof TelegramError)) throw e;
        const failure = e;
        if (failure.uncertain) {
          if (row.booking_reminder_id)
            await tx
              .updateTable("booking_reminder")
              .set({ status: "uncertain", last_error: "DELIVERY_UNKNOWN" })
              .where("id", "=", row.booking_reminder_id)
              .execute();
          if (row.post_delivery_id)
            await postDeliveryResult(
              tx,
              row.post_delivery_id,
              "uncertain",
              null,
              "DELIVERY_UNKNOWN",
            );
          await tx
            .updateTable("telegram_outbox")
            .set({
              delivery_state: "uncertain",
              last_error: "DELIVERY_UNKNOWN",
            })
            .where("id", "=", row.id)
            .execute();
          if (row.communication_message_id)
            await tx
              .updateTable("communication_message")
              .set({ delivery_status: "uncertain" })
              .where("id", "=", row.communication_message_id)
              .execute();
          return true;
        }
        if (failure.chatUnavailable) {
          const cancelled = await tx
            .selectFrom("telegram_outbox")
            .select([
              "communication_message_id",
              "booking_reminder_id",
              "post_delivery_id",
            ])
            .where("connection_id", "=", row.connection_id)
            .where("chat_id", "=", row.chat_id)
            .where("delivered_at", "is", null)
            .execute();
          for (const job of cancelled) {
            if (job.communication_message_id)
              await tx
                .updateTable("communication_message")
                .set({ delivery_status: "failed" })
                .where("id", "=", job.communication_message_id)
                .execute();
            if (job.booking_reminder_id)
              await tx
                .updateTable("booking_reminder")
                .set({ status: "failed", last_error: "CHAT_UNAVAILABLE" })
                .where("id", "=", job.booking_reminder_id)
                .execute();
            if (job.post_delivery_id)
              await postDeliveryResult(
                tx,
                job.post_delivery_id,
                "failed",
                null,
                "CHAT_UNAVAILABLE",
              );
          }
          // A recipient may block the bot. Cancel only that chat's pending work;
          // never pause every customer's channel or mark unsent replies delivered.
          await tx
            .deleteFrom("telegram_outbox")
            .where("connection_id", "=", row.connection_id)
            .where("chat_id", "=", row.chat_id)
            .where("delivered_at", "is", null)
            .execute();
          await tx
            .deleteFrom("telegram_dialog")
            .where("connection_id", "=", row.connection_id)
            .where("chat_id", "=", row.chat_id)
            .execute();
          return true;
        }
        const attempts = row.attempts + 1;
        const exhausted =
          failure.permanent || attempts >= (row.post_delivery_id ? 4 : 8);
        await tx
          .updateTable("telegram_outbox")
          .set({
            delivery_state: exhausted ? "failed" : "pending",
            claimed_at: null,
            attempts: exhausted ? 8 : attempts,
            available_at: new Date(
              Date.now() +
                1000 *
                  Math.max(
                    failure.retryAfter,
                    row.post_delivery_id
                      ? ([60, 300, 900][attempts - 1] ?? 900)
                      : Math.min(900, 2 ** attempts),
                  ),
            ),
            last_error: failure.permanent ? "PERMANENT" : "RETRY",
          })
          .where("id", "=", row.id)
          .execute();
        if (exhausted && row.communication_message_id)
          await tx
            .updateTable("communication_message")
            .set({ delivery_status: "failed" })
            .where("id", "=", row.communication_message_id)
            .execute();
        if (exhausted && row.booking_reminder_id)
          await tx
            .updateTable("booking_reminder")
            .set({ status: "failed", last_error: "DELIVERY_FAILED" })
            .where("id", "=", row.booking_reminder_id)
            .execute();
        if (exhausted && row.post_delivery_id)
          await postDeliveryResult(
            tx,
            row.post_delivery_id,
            "failed",
            null,
            "DELIVERY_FAILED",
          );
        if (exhausted && !row.post_delivery_id)
          await tx
            .updateTable("telegram_runtime")
            .set({ status: "error", updated_at: new Date() })
            .where("connection_id", "=", row.connection_id)
            .execute();
      }
      return true;
    });
  }
}
