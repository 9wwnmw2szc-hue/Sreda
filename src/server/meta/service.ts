import { sql, type Kysely } from "kysely";
import { randomUUID } from "node:crypto";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { decryptSecret } from "../connections/crypto.ts";
import { claimDelivery, expireClaims } from "../outbox/claim.ts";
import { CommunicationService } from "../communications/service.ts";
import { SolutionService } from "../solutions/service.ts";
import { notificationValid } from "../notifications/worker.ts";
import {
  MetaApiError,
  metaGraph,
  verifyMetaSignature,
  whatsappSessionOpen,
} from "./api.ts";
import {
  metaConfigured,
  readMetaConfig,
  type MetaConfig,
} from "./config.ts";
import type { MetaPlatform } from "../channels/types.ts";

type WhatsAppChangeValue = {
  messaging_product?: string;
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: {
    from?: string;
    id?: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
    button?: { text?: string };
    interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  }[];
  statuses?: {
    id?: string;
    status?: string;
    recipient_id?: string;
    timestamp?: string;
  }[];
};

type IgMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
  read?: { watermark?: number };
};

export class MetaChannelService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly secret: string,
    private readonly enabled: boolean,
    private readonly communications = new CommunicationService(db),
    private readonly transport: typeof fetch = fetch,
    private readonly config: MetaConfig = readMetaConfig(),
  ) {}

  private assertEnabled() {
    if (!this.enabled || !metaConfigured(this.config))
      throw new AppError(
        503,
        "META_DISABLED",
        "Обработка WhatsApp/Instagram ещё не включена на сервере.",
      );
  }

  async startWhatsApp(userId: string, publicId: string) {
    return this.start(userId, publicId, "whatsapp");
  }

  async startInstagram(userId: string, publicId: string) {
    return this.start(userId, publicId, "instagram");
  }

  private async start(
    userId: string,
    publicId: string,
    platform: MetaPlatform,
  ) {
    this.assertEnabled();
    let affected: string | undefined;
    try {
      return await this.db.transaction().execute(async (tx) => {
        const solutions = new SolutionService(tx, true, true);
        const businessId = await solutions.business(userId, publicId, true);
        await tx
          .selectFrom("business")
          .select("id")
          .where("id", "=", businessId)
          .forUpdate()
          .execute();
        const connection = await tx
          .selectFrom("business_connection as c")
          .innerJoin("connection_secret as s", "s.connection_id", "c.id")
          .innerJoin("meta_runtime as r", "r.connection_id", "c.id")
          .select([
            "c.id",
            "s.encrypted_token",
            "r.waba_id",
            "r.phone_number_id",
            "r.page_id",
            "r.ig_user_id",
          ])
          .where("c.business_id", "=", businessId)
          .where("c.platform", "=", platform)
          .where("c.status", "=", "connected")
          .executeTakeFirst();
        if (!connection)
          throw new AppError(
            400,
            "CONNECTION_REQUIRED",
            platform === "whatsapp"
              ? "Сначала подключите WhatsApp через Meta."
              : "Сначала подключите Instagram через Meta.",
          );
        affected = connection.id;
        const generation = randomUUID();
        await tx
          .updateTable("meta_runtime")
          .set({
            generation,
            status: "pending",
            last_error: null,
            updated_at: new Date(),
          })
          .where("connection_id", "=", connection.id)
          .execute();
        const token = decryptSecret(connection.encrypted_token, this.secret);
        let subscribed = false;
        try {
          if (platform === "whatsapp" && connection.waba_id) {
            await metaGraph(`${connection.waba_id}/subscribed_apps`, {
              method: "POST",
              accessToken: token,
              transport: this.transport,
              config: this.config,
            });
            subscribed = true;
          } else if (platform === "instagram" && connection.page_id) {
            await metaGraph(`${connection.page_id}/subscribed_apps`, {
              method: "POST",
              accessToken: token,
              body: {
                subscribed_fields: [
                  "messages",
                  "messaging_postbacks",
                  "message_deliveries",
                  "message_reads",
                ],
              },
              transport: this.transport,
              config: this.config,
            });
            subscribed = true;
          }
        } catch (error) {
          const message =
            error instanceof MetaApiError
              ? error.message
              : "Не удалось подписать webhook Meta.";
          await tx
            .updateTable("meta_runtime")
            .set({
              status: "error",
              last_error: "WEBHOOK_SUBSCRIBE_FAILED",
              updated_at: new Date(),
            })
            .where("connection_id", "=", connection.id)
            .execute();
          throw new AppError(502, "META_WEBHOOK_SUBSCRIBE_FAILED", message);
        }
        await tx
          .updateTable("meta_runtime")
          .set({
            status: "ready",
            webhook_subscribed: subscribed,
            last_error: null,
            updated_at: new Date(),
          })
          .where("connection_id", "=", connection.id)
          .execute();
        return { ok: true as const, webhookSubscribed: subscribed };
      });
    } catch (error) {
      if (affected && !(error instanceof AppError && error.code === "META_WEBHOOK_SUBSCRIBE_FAILED"))
        await this.db
          .updateTable("meta_runtime")
          .set({ status: "error", updated_at: new Date() })
          .where("connection_id", "=", affected)
          .execute();
      throw error;
    }
  }

  handleWebhookVerify(mode: string | null, token: string | null, challenge: string | null) {
    if (mode !== "subscribe" || !token || challenge == null)
      throw new AppError(403, "INVALID_WEBHOOK", "Запрос не подтверждён.");
    if (
      !this.config.webhookVerifyToken ||
      token !== this.config.webhookVerifyToken
    )
      throw new AppError(403, "INVALID_WEBHOOK", "Запрос не подтверждён.");
    return challenge;
  }

  async receiveWebhook(rawBody: string, signatureHeader: string | null) {
    this.assertEnabled();
    if (
      !verifyMetaSignature(
        rawBody,
        signatureHeader,
        this.config.appSecret,
      )
    )
      throw new AppError(403, "INVALID_SIGNATURE", "Подпись webhook неверна.");
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new AppError(400, "INVALID_BODY", "Некорректное тело webhook.");
    }
    const object = payload.object;
    if (object === "whatsapp_business_account")
      await this.receiveWhatsApp(payload);
    else if (object === "instagram" || object === "page")
      await this.receiveInstagram(payload);
    return { ok: true as const };
  }

  private async receiveWhatsApp(payload: Record<string, unknown>) {
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const changes = Array.isArray((entry as { changes?: unknown }).changes)
        ? (entry as { changes: unknown[] }).changes
        : [];
      for (const change of changes) {
        if (!change || typeof change !== "object") continue;
        const value = (change as { value?: WhatsAppChangeValue }).value;
        if (!value?.metadata?.phone_number_id) continue;
        const phoneNumberId = value.metadata.phone_number_id;
        await this.db.transaction().execute(async (tx) => {
          const resolved = await tx
            .selectFrom("meta_runtime as r")
            .innerJoin("business_connection as c", "c.id", "r.connection_id")
            .innerJoin("business as b", "b.id", "c.business_id")
            .select([
              "c.id as connectionId",
              "c.business_id as businessId",
              "r.status as runtimeStatus",
              "c.status as connectionStatus",
            ])
            .where("r.phone_number_id", "=", phoneNumberId)
            .where("c.platform", "=", "whatsapp")
            .where("b.archived_at", "is", null)
            .executeTakeFirst();
          if (
            !resolved ||
            resolved.connectionStatus !== "connected" ||
            resolved.runtimeStatus !== "ready"
          )
            return;
          await tx
            .selectFrom("business")
            .select("id")
            .where("id", "=", resolved.businessId)
            .forUpdate()
            .executeTakeFirst();

          for (const status of value.statuses ?? []) {
            if (!status.id || !status.status) continue;
            const eventId = `wa:status:${status.id}:${status.status}`;
            const unique = await tx
              .insertInto("meta_update")
              .values({
                connection_id: resolved.connectionId,
                event_id: eventId,
              })
              .onConflict((oc) =>
                oc.columns(["connection_id", "event_id"]).doNothing(),
              )
              .returning("event_id")
              .executeTakeFirst();
            if (!unique) continue;
            const delivery =
              status.status === "failed"
                ? "failed"
                : status.status === "read" ||
                    status.status === "delivered" ||
                    status.status === "sent"
                  ? "sent"
                  : null;
            if (!delivery) continue;
            await tx
              .updateTable("communication_message")
              .set({ delivery_status: delivery })
              .where("business_id", "=", resolved.businessId)
              .where(
                "external_message_id",
                "=",
                `whatsapp:${resolved.connectionId}:${status.id}`,
              )
              .execute();
            if (delivery === "failed") {
              await tx
                .updateTable("meta_outbox")
                .set({ delivery_state: "failed" })
                .where("connection_id", "=", resolved.connectionId)
                .where("external_message_id", "=", status.id)
                .where("delivered_at", "is", null)
                .execute();
            } else {
              await tx
                .updateTable("meta_outbox")
                .set({
                  delivery_state: "sent",
                  delivered_at: new Date(),
                })
                .where("connection_id", "=", resolved.connectionId)
                .where("external_message_id", "=", status.id)
                .where("delivered_at", "is", null)
                .execute();
            }
          }

          for (const message of value.messages ?? []) {
            if (!message.from || !message.id) continue;
            const eventId = `wa:msg:${message.id}`;
            const unique = await tx
              .insertInto("meta_update")
              .values({
                connection_id: resolved.connectionId,
                event_id: eventId,
              })
              .onConflict((oc) =>
                oc.columns(["connection_id", "event_id"]).doNothing(),
              )
              .returning("event_id")
              .executeTakeFirst();
            if (!unique) continue;
            const contactName =
              value.contacts?.find((c) => c.wa_id === message.from)?.profile
                ?.name ?? null;
            const text =
              message.text?.body ||
              message.button?.text ||
              message.interactive?.button_reply?.title ||
              message.interactive?.list_reply?.title ||
              (message.type && message.type !== "text" ? "Вложение" : "");
            if (!text) continue;
            await this.communications.recordInboundInTransaction(tx, {
              businessId: resolved.businessId,
              platform: "whatsapp",
              externalUserId: message.from,
              externalUsername: contactName,
              text,
              externalMessageId: `whatsapp:${resolved.connectionId}:${message.id}`,
              connectionId: resolved.connectionId,
            });
          }
        });
      }
    }
  }

  private async receiveInstagram(payload: Record<string, unknown>) {
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const pageId = String((entry as { id?: unknown }).id || "");
      const messaging = Array.isArray(
        (entry as { messaging?: unknown }).messaging,
      )
        ? ((entry as { messaging: IgMessagingEvent[] }).messaging)
        : [];
      if (!pageId || !messaging.length) continue;
      await this.db.transaction().execute(async (tx) => {
        const resolved = await tx
          .selectFrom("meta_runtime as r")
          .innerJoin("business_connection as c", "c.id", "r.connection_id")
          .innerJoin("business as b", "b.id", "c.business_id")
          .select([
            "c.id as connectionId",
            "c.business_id as businessId",
            "r.status as runtimeStatus",
            "c.status as connectionStatus",
            "r.ig_user_id as igUserId",
            "r.page_id as pageId",
          ])
          .where((eb) =>
            eb.or([
              eb("r.page_id", "=", pageId),
              eb("r.ig_user_id", "=", pageId),
            ]),
          )
          .where("c.platform", "=", "instagram")
          .where("b.archived_at", "is", null)
          .executeTakeFirst();
        if (
          !resolved ||
          resolved.connectionStatus !== "connected" ||
          resolved.runtimeStatus !== "ready"
        )
          return;
        await tx
          .selectFrom("business")
          .select("id")
          .where("id", "=", resolved.businessId)
          .forUpdate()
          .executeTakeFirst();

        for (const event of messaging) {
          if (event.message?.is_echo) continue;
          if (event.read) {
            const eventId = `ig:read:${resolved.connectionId}:${event.sender?.id}:${event.read.watermark ?? event.timestamp ?? 0}`;
            await tx
              .insertInto("meta_update")
              .values({
                connection_id: resolved.connectionId,
                event_id: eventId,
              })
              .onConflict((oc) =>
                oc.columns(["connection_id", "event_id"]).doNothing(),
              )
              .execute();
            continue;
          }
          const mid = event.message?.mid;
          const senderId = event.sender?.id;
          if (!mid || !senderId) continue;
          const eventId = `ig:msg:${mid}`;
          const unique = await tx
            .insertInto("meta_update")
            .values({
              connection_id: resolved.connectionId,
              event_id: eventId,
            })
            .onConflict((oc) =>
              oc.columns(["connection_id", "event_id"]).doNothing(),
            )
            .returning("event_id")
            .executeTakeFirst();
          if (!unique) continue;
          const text = event.message?.text?.trim() || "Вложение";
          await this.communications.recordInboundInTransaction(tx, {
            businessId: resolved.businessId,
            platform: "instagram",
            externalUserId: senderId,
            externalUsername: null,
            text,
            externalMessageId: `instagram:${resolved.connectionId}:${mid}`,
            connectionId: resolved.connectionId,
          });
        }
      });
    }
  }

  async deliverOne() {
    if (!this.enabled || !metaConfigured(this.config)) return false;
    await this.db
      .insertInto("worker_heartbeat")
      .values({ name: "meta_delivery", seen_at: new Date() })
      .onConflict((oc) =>
        oc.column("name").doUpdateSet({ seen_at: new Date() }),
      )
      .execute();
    await expireClaims(this.db, "whatsapp");
    const candidate = await this.db
      .selectFrom("meta_outbox as o")
      .innerJoin("business_connection as c", "c.id", "o.connection_id")
      .innerJoin("business as b", "b.id", "c.business_id")
      .innerJoin("meta_runtime as r", "r.connection_id", "c.id")
      .innerJoin(
        "connection_secret as credential",
        "credential.connection_id",
        "c.id",
      )
      .select([
        "o.id",
        "c.business_id",
        "c.platform",
        "r.phone_number_id",
        "r.page_id",
      ])
      .where("b.archived_at", "is", null)
      .where("c.status", "=", "connected")
      .where("c.platform", "in", ["whatsapp", "instagram"])
      .where("o.delivery_state", "=", "pending")
      .where("o.delivered_at", "is", null)
      .where("o.attempts", "<", 8)
      .where("o.available_at", "<=", new Date())
      .where("r.status", "=", "ready")
      .where(
        sql<boolean>`not exists(select 1 from meta_outbox previous where previous.connection_id=o.connection_id and previous.recipient_id=o.recipient_id and previous.id<o.id and previous.delivered_at is null and previous.delivery_state in ('pending','sending'))`,
      )
      .orderBy("o.id")
      .executeTakeFirst();
    if (!candidate) return false;
    const claimPlatform =
      candidate.platform === "instagram" ? "instagram" : "whatsapp";
    if (!(await claimDelivery(this.db, claimPlatform, candidate.id)))
      return false;
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
          .updateTable("meta_outbox")
          .set({ delivery_state: "pending", claimed_at: null })
          .where("id", "=", candidate.id)
          .where("delivery_state", "=", "sending")
          .execute();
        return false;
      }
      const row = await tx
        .selectFrom("meta_outbox")
        .selectAll()
        .where("id", "=", candidate.id)
        .where("delivery_state", "=", "sending")
        .where("delivered_at", "is", null)
        .where("available_at", "<=", new Date())
        .forUpdate()
        .executeTakeFirst();
      if (!row) return false;
      const connection = await tx
        .selectFrom("connection_secret as s")
        .innerJoin("meta_runtime as r", "r.connection_id", "s.connection_id")
        .innerJoin("business_connection as c", "c.id", "s.connection_id")
        .select([
          "s.encrypted_token",
          "c.platform",
          "r.phone_number_id",
          "r.page_id",
        ])
        .where("s.connection_id", "=", row.connection_id)
        .where("r.status", "=", "ready")
        .where("c.status", "=", "connected")
        .executeTakeFirst();
      if (!connection) {
        await tx
          .updateTable("meta_outbox")
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
            row.recipient_id,
          )))
      ) {
        await tx
          .updateTable("meta_outbox")
          .set({
            delivery_state: "failed",
            last_error: "RECIPIENT_UNAVAILABLE",
          })
          .where("id", "=", row.id)
          .execute();
        return true;
      }
      if (connection.platform === "whatsapp" && !row.template_name) {
        const conversation = await tx
          .selectFrom("communication_conversation")
          .select("last_inbound_at")
          .where("business_id", "=", candidate.business_id)
          .where("platform", "=", "whatsapp")
          .where("external_user_id", "=", row.recipient_id)
          .executeTakeFirst();
        if (!whatsappSessionOpen(conversation?.last_inbound_at)) {
          await tx
            .updateTable("meta_outbox")
            .set({
              delivery_state: "failed",
              last_error: "WHATSAPP_WINDOW_CLOSED",
              message: "",
            })
            .where("id", "=", row.id)
            .execute();
          if (row.communication_message_id)
            await tx
              .updateTable("communication_message")
              .set({ delivery_status: "failed" })
              .where("id", "=", row.communication_message_id)
              .execute();
          return true;
        }
      }
      try {
        const token = decryptSecret(connection.encrypted_token, this.secret);
        let externalId: string | null = null;
        if (connection.platform === "whatsapp") {
          if (!connection.phone_number_id)
            throw new MetaApiError(
              400,
              "META_RUNTIME_INCOMPLETE",
              "Не указан phone_number_id WhatsApp.",
            );
          const body = row.template_name
            ? {
                messaging_product: "whatsapp",
                to: row.recipient_id,
                type: "template",
                template: {
                  name: row.template_name,
                  language: {
                    code: row.template_language || "ru",
                  },
                },
              }
            : {
                messaging_product: "whatsapp",
                to: row.recipient_id,
                type: "text",
                text: { body: row.message },
              };
          const result = await metaGraph<{
            messages?: { id?: string }[];
          }>(`${connection.phone_number_id}/messages`, {
            method: "POST",
            accessToken: token,
            body,
            transport: this.transport,
            config: this.config,
          });
          externalId = result.messages?.[0]?.id ?? null;
        } else {
          const pageId = connection.page_id || "me";
          const result = await metaGraph<{ message_id?: string }>(
            `${pageId}/messages`,
            {
              method: "POST",
              accessToken: token,
              body: {
                recipient: { id: row.recipient_id },
                messaging_type: "RESPONSE",
                message: { text: row.message },
              },
              transport: this.transport,
              config: this.config,
            },
          );
          externalId = result.message_id ?? null;
        }
        await tx
          .updateTable("meta_outbox")
          .set({
            delivery_state: "sent",
            external_message_id: externalId,
            delivered_at: new Date(),
            message: "",
            last_error: null,
          })
          .where("id", "=", row.id)
          .execute();
        if (row.communication_message_id) {
          const remaining = await tx
            .selectFrom("meta_outbox")
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
                external_message_id: externalId
                  ? `${connection.platform}:${row.connection_id}:${externalId}`
                  : null,
              })
              .where("id", "=", row.communication_message_id)
              .execute();
        }
      } catch (e) {
        if (!(e instanceof MetaApiError)) throw e;
        const attempts = row.attempts + 1;
        const permanent =
          e.status === 400 ||
          e.status === 403 ||
          e.metaCode === 100 ||
          e.metaCode === 10;
        const exhausted = permanent || attempts >= 8;
        await tx
          .updateTable("meta_outbox")
          .set({
            delivery_state: exhausted ? "failed" : "pending",
            claimed_at: null,
            attempts: exhausted ? 8 : attempts,
            available_at: new Date(
              Date.now() + 1000 * Math.min(900, 2 ** attempts),
            ),
            last_error: permanent ? "PERMANENT" : "RETRY",
          })
          .where("id", "=", row.id)
          .execute();
        if (exhausted && row.communication_message_id)
          await tx
            .updateTable("communication_message")
            .set({ delivery_status: "failed" })
            .where("id", "=", row.communication_message_id)
            .execute();
        if (exhausted)
          await tx
            .updateTable("meta_runtime")
            .set({
              status: "error",
              last_error: "DELIVERY_FAILED",
              updated_at: new Date(),
            })
            .where("connection_id", "=", row.connection_id)
            .execute();
      }
      return true;
    });
  }
}
