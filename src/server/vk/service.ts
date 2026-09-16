import { autopostEnabled } from "../posts/availability.ts";
import { limit } from "../http/limits.ts";
import { prepareVKMedia } from "../attachments/send.ts";
import { vkAttachments } from "../attachments/inbound.ts";
import { postDeliveryResult } from "../posts/delivery.ts";
import { reminderValid } from "../booking/worker.ts";
import { claimDelivery, expireClaims } from "../outbox/claim.ts";
import { routeBot } from "../bot/router.ts";
import { requireBusiness } from "../access/permissions.ts";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { CommunicationService } from "../communications/service.ts";
import { decryptSecret } from "../connections/crypto.ts";
import { vkCall, VKError } from "./api.ts";

type VKMessage = {
  date?: number;
  from_id?: number;
  peer_id?: number;
  text?: string;
  conversation_message_id?: number;
};

export function callbackSecret(
  secret: string,
  connectionId: string,
  generation: string,
) {
  return createHmac("sha256", secret)
    .update("vk-callback:" + connectionId + ":" + generation)
    .digest("hex");
}

export class VKService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly secret: string,
    private readonly enabled: boolean,
    private readonly communications?: CommunicationService,
    private readonly transport: typeof fetch = fetch,
  ) {}

  async start(userId: string, publicId: string, origin: string) {
    if (!this.enabled)
      throw new AppError(
        503,
        "VK_DISABLED",
        "Обработка VK ещё не включена на сервере.",
      );
    const prepared = await this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(
        tx,
        userId,
        publicId,
        "connections.manage",
      );
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, publicId, "connections.manage");
      const c = await tx
        .selectFrom("business_connection as c")
        .innerJoin("connection_secret as s", "s.connection_id", "c.id")
        .select(["c.id", "c.external_account_id", "s.encrypted_token"])
        .where("c.business_id", "=", b.id)
        .where("c.platform", "=", "vk")
        .where("c.status", "=", "connected")
        .executeTakeFirst();
      if (!c?.external_account_id)
        throw new AppError(
          400,
          "CONNECTION_REQUIRED",
          "Сначала подключите токен сообщества.",
        );
      const old = await tx
        .selectFrom("vk_runtime")
        .selectAll()
        .where("connection_id", "=", c.id)
        .executeTakeFirst();
      if (old?.setup_lock_until && +old.setup_lock_until > Date.now())
        throw new AppError(
          409,
          "VK_SETUP_RUNNING",
          "Подключение уже настраивается. Подождите.",
        );
      const generation = randomUUID();
      const row = {
        connection_id: c.id,
        generation,
        status: "pending" as const,
        setup_lock_until: new Date(Date.now() + 300000),
        confirmation_code: null,
        updated_at: new Date(),
      };
      await tx
        .insertInto("vk_runtime")
        .values(row)
        .onConflict((oc) => oc.column("connection_id").doUpdateSet(row))
        .execute();
      return { ...c, generation };
    });
    const token = decryptSecret(prepared.encrypted_token, this.secret);
    const group_id = prepared.external_account_id;
    const url = origin + "/api/vk/" + prepared.id;
    try {
      const result = (await vkCall(
        token,
        "groups.getCallbackConfirmationCode",
        { group_id },
        this.transport,
      )) as { code?: string };
      if (!result.code)
        throw new AppError(
          503,
          "VK_CONFIRMATION_FAILED",
          "VK не вернул код подтверждения.",
        );
      await this.db
        .updateTable("vk_runtime")
        .set({ confirmation_code: result.code })
        .where("connection_id", "=", prepared.id)
        .where("generation", "=", prepared.generation)
        .execute();
      const servers = (await vkCall(
        token,
        "groups.getCallbackServers",
        { group_id },
        this.transport,
      )) as { items?: { id: number; url: string }[] };
      const existing = servers.items?.find((s) => s.url === url);
      let server_id = existing?.id;
      const body = {
        group_id,
        url,
        title: "Sreda",
        secret_key: callbackSecret(
          this.secret,
          prepared.id,
          prepared.generation,
        ).slice(0, 48),
      };
      if (server_id)
        await vkCall(
          token,
          "groups.editCallbackServer",
          { ...body, server_id },
          this.transport,
        );
      else
        server_id = (
          (await vkCall(
            token,
            "groups.addCallbackServer",
            body,
            this.transport,
          )) as { server_id: number }
        ).server_id;
      if (!Number.isSafeInteger(server_id))
        throw new AppError(
          503,
          "VK_SETUP_FAILED",
          "Не удалось добавить сервер VK.",
        );
      await vkCall(
        token,
        "groups.setCallbackSettings",
        { group_id, server_id, api_version: "5.199", message_new: 1 },
        this.transport,
      );
      await this.db
        .updateTable("vk_runtime")
        .set({
          status: "ready",
          server_id,
          setup_lock_until: null,
          updated_at: new Date(),
        })
        .where("connection_id", "=", prepared.id)
        .where("generation", "=", prepared.generation)
        .execute();
      return { ok: true };
    } catch (error) {
      await this.db
        .updateTable("vk_runtime")
        .set({
          status: "error",
          setup_lock_until: null,
          updated_at: new Date(),
        })
        .where("connection_id", "=", prepared.id)
        .where("generation", "=", prepared.generation)
        .execute();
      throw error;
    }
  }

  async receive(id: string, body: Record<string, unknown>) {
    if (!this.enabled)
      throw new AppError(
        503,
        "VK_DISABLED",
        "Обработка VK временно недоступна.",
      );
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        id,
      )
    )
      throw new AppError(404, "NOT_FOUND", "Подключение не найдено.");
    return this.db.transaction().execute(async (tx) => {
      const runtime = await tx
        .selectFrom("vk_runtime as r")
        .innerJoin("business_connection as c", "c.id", "r.connection_id")
        .select([
          "r.generation",
          "r.status",
          "c.business_id",
          "c.status as connectionStatus",
          "c.platform",
          "c.external_account_id",
          "r.confirmation_code",
        ])
        .where("r.connection_id", "=", id)
        .executeTakeFirst();
      const provided = typeof body.secret === "string" ? body.secret : "";
      const full = runtime
        ? callbackSecret(this.secret, id, runtime.generation)
        : "";
      const expected = provided.length === 48 ? full.slice(0, 48) : full;
      const validSecret =
        /^[a-f0-9]{48}$|^[a-f0-9]{64}$/.test(provided) &&
        provided.length === expected.length &&
        timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
      if (
        !runtime ||
        runtime.platform !== "vk" ||
        runtime.connectionStatus !== "connected" ||
        !validSecret ||
        String(body.group_id) !== runtime.external_account_id
      )
        throw new AppError(403, "INVALID_WEBHOOK", "Запрос не подтверждён.");
      const type = body.type;
      if (type === "confirmation" && runtime.confirmation_code)
        return { confirmation: runtime.confirmation_code };
      if (runtime.status !== "ready")
        throw new AppError(503, "CHANNEL_PAUSED", "Канал ещё не готов.");
      const business = await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", runtime.business_id)
        .where("archived_at", "is", null)
        .forUpdate()
        .executeTakeFirst();
      const fresh = await tx
        .selectFrom("vk_runtime")
        .select(["generation", "status"])
        .where("connection_id", "=", id)
        .executeTakeFirst();
      if (
        !business ||
        fresh?.generation !== runtime.generation ||
        fresh.status !== "ready"
      )
        throw new AppError(503, "CHANNEL_PAUSED", "Канал временно недоступен.");
      if (type !== "message_new") return { ok: true };
      const eventId = typeof body.event_id === "string" ? body.event_id : "";
      if (!eventId || eventId.length > 200)
        throw new AppError(400, "INVALID_EVENT", "Некорректное событие VK.");
      const unique = await tx
        .insertInto("vk_update")
        .values({ connection_id: id, event_id: eventId })
        .onConflict((oc) =>
          oc.columns(["connection_id", "event_id"]).doNothing(),
        )
        .returning("event_id")
        .executeTakeFirst();
      if (!unique) return { ok: true, duplicate: true };
      const object = body.object as { message?: VKMessage } | undefined;
      const message = object?.message ?? (body.object as VKMessage | undefined);
      if (
        !message ||
        typeof message.from_id !== "number" ||
        typeof message.peer_id !== "number" ||
        !Number.isSafeInteger(message.from_id) ||
        !Number.isSafeInteger(message.peer_id) ||
        typeof message.text !== "string" ||
        message.from_id <= 0 ||
        message.peer_id <= 0 ||
        message.from_id !== message.peer_id
      )
        return { ok: true };
      await limit(tx, this.secret, "bot:" + id + ":" + message.from_id, 30, 60);
      await routeBot(tx, {
        businessId: runtime.business_id,
        connectionId: id,
        platform: "vk",
        userId: String(message.from_id),
        eventId,
        text: message.text,
        attachments: vkAttachments(message),
      });
      return { ok: true, accepted: true };
    });
  }

  async deliverOne() {
    if (!this.enabled) return false;
    await this.db
      .insertInto("worker_heartbeat")
      .values({ name: "vk", seen_at: new Date() })
      .onConflict((oc) =>
        oc.column("name").doUpdateSet({ seen_at: new Date() }),
      )
      .execute();
    await expireClaims(this.db, "vk");
    const candidate = await this.db
      .selectFrom("vk_outbox as o")
      .innerJoin("business_connection as c", "c.id", "o.connection_id")
      .innerJoin("business as b", "b.id", "c.business_id")
      .where("b.archived_at", "is", null)
      .innerJoin("vk_runtime as r", "r.connection_id", "c.id")
      .innerJoin(
        "connection_secret as credential",
        "credential.connection_id",
        "c.id",
      )
      .select(["o.id", "c.business_id"])
      .where("o.delivery_state", "=", "pending")
      .where("o.delivered_at", "is", null)
      .where("o.attempts", "<", 8)
      .where("o.available_at", "<=", new Date())
      .where("r.status", "=", "ready")
      .where("c.status", "=", "connected")
      .where(
        sql<boolean>`not exists(select 1 from vk_outbox previous where previous.connection_id=o.connection_id and previous.peer_id=o.peer_id and previous.id<o.id and previous.delivered_at is null and previous.delivery_state in ('pending','sending'))`,
      )
      .where(
        sql<boolean>`(o.post_delivery_id is null or exists(select 1 from post_delivery d join business_solution s on s.business_id=d.business_id where d.id=o.post_delivery_id and d.status='publishing' and s.solution_code='autopost' and s.status in ('active','trial') and (s.expires_at is null or s.expires_at > now())))`,
      )
      .orderBy("o.id")
      .executeTakeFirst();
    if (!candidate) return false;
    if (!(await claimDelivery(this.db, "vk", candidate.id))) return false;
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
          .updateTable("vk_outbox")
          .set({ delivery_state: "pending", claimed_at: null })
          .where("id", "=", candidate.id)
          .where("delivery_state", "=", "sending")
          .execute();
        return false;
      }
      const row = await tx
        .selectFrom("vk_outbox")
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
          .updateTable("vk_outbox")
          .set({ delivery_state: "pending", claimed_at: null })
          .where("id", "=", row.id)
          .execute();
        return false;
      }
      const connection = await tx
        .selectFrom("connection_secret as s")
        .innerJoin("vk_runtime as r", "r.connection_id", "s.connection_id")
        .innerJoin("business_connection as c", "c.id", "s.connection_id")
        .select([
          "s.encrypted_token",
          "s.encrypted_publish_token",
          "r.generation",
        ])
        .where("s.connection_id", "=", row.connection_id)
        .where("r.status", "=", "ready")
        .where("c.status", "=", "connected")
        .executeTakeFirst();
      if (!connection) {
        await tx
          .updateTable("vk_outbox")
          .set({ delivery_state: "pending", claimed_at: null })
          .where("id", "=", candidate.id)
          .where("delivery_state", "=", "sending")
          .execute();
        return false;
      }
      if (
        row.booking_reminder_id &&
        !(await reminderValid(tx, row.booking_reminder_id))
      ) {
        await tx
          .updateTable("vk_outbox")
          .set({ delivery_state: "failed", last_error: "STALE_REMINDER" })
          .where("id", "=", row.id)
          .execute();
        return true;
      }
      try {
        // Keep random_id stable across retries so VK deduplicates a response
        // when the network fails after the platform accepted the message.
        const randomId = Number(BigInt(String(row.id)) % BigInt(2_147_483_647));
        const attachment = await prepareVKMedia(
          tx,
          this.secret,
          business.id,
          decryptSecret(connection.encrypted_token, this.secret),
          connection.encrypted_publish_token
            ? decryptSecret(connection.encrypted_publish_token, this.secret)
            : undefined,
          row.peer_id,
          row.attachment_ids as string[],
          !!row.post_delivery_id,
          this.transport,
        );
        const delivered = await vkCall(
          decryptSecret(
            row.post_delivery_id
              ? (connection.encrypted_publish_token ??
                  connection.encrypted_token)
              : connection.encrypted_token,
            this.secret,
          ),
          row.post_delivery_id ? "wall.post" : "messages.send",
          row.post_delivery_id
            ? {
                ...(row.api_payload as Record<string, unknown>),
                attachments: attachment,
              }
            : {
                attachment,
                peer_id: row.peer_id,
                random_id: randomId,
                message: row.message,
                keyboard: JSON.stringify({
                  one_time: false,
                  buttons: (row.buttons as string[])
                    .slice(0, 10)
                    .map((label) => [
                      { action: { type: "text", label }, color: "secondary" },
                    ]),
                }),
              },
          this.transport,
        );
        await tx
          .updateTable("vk_outbox")
          .set({
            delivery_state: "sent",
            external_message_id: row.post_delivery_id
              ? String((delivered as { post_id?: number }).post_id ?? "")
              : String(delivered),
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
            String((delivered as { post_id?: number }).post_id ?? ""),
          );
        if (row.booking_reminder_id)
          await tx
            .updateTable("booking_reminder")
            .set({ status: "sent" })
            .where("id", "=", row.booking_reminder_id)
            .execute();
        if (row.communication_message_id) {
          const remaining = await tx
            .selectFrom("vk_outbox")
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
                external_message_id: `vk:${row.connection_id}:${row.peer_id}:${delivered}`,
              })
              .where("id", "=", row.communication_message_id)
              .execute();
        }
      } catch (error) {
        if (!(error instanceof VKError)) throw error;
        const failure = error;
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
            .updateTable("vk_outbox")
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
            .selectFrom("vk_outbox")
            .select([
              "communication_message_id",
              "booking_reminder_id",
              "post_delivery_id",
            ])
            .where("connection_id", "=", row.connection_id)
            .where("peer_id", "=", row.peer_id)
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
          await tx
            .deleteFrom("vk_outbox")
            .where("connection_id", "=", row.connection_id)
            .where("peer_id", "=", row.peer_id)
            .where("delivered_at", "is", null)
            .execute();
          return true;
        }
        const attempts = row.attempts + 1;
        const exhausted =
          failure.permanent || attempts >= (row.post_delivery_id ? 4 : 8);
        await tx
          .updateTable("vk_outbox")
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
            .updateTable("vk_runtime")
            .set({ status: "error", updated_at: new Date() })
            .where("connection_id", "=", row.connection_id)
            .execute();
      }
      return true;
    });
  }
}
