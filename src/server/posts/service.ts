import { audit } from "../audit/service.ts";
import { randomUUID, createHash } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { requireBusiness } from "../access/permissions.ts";
import { assertEntitlement } from "../billing/entitlement.ts";
import { decryptSecret, encryptSecret } from "../connections/crypto.ts";
import { telegramCall } from "../telegram/api.ts";
import { vkCall } from "../vk/api.ts";
import { recurrence, nextOccurrence } from "./recurrence.ts";
import { localInstants } from "../booking/time.ts";
const validLink = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
};
const invalid = (message = "Проверьте публикацию.") =>
  new AppError(400, "INVALID_POST", message);
export class PostService {
  constructor(
    private db: Kysely<Database>,
    private secret: string,
    private transport: typeof fetch = fetch,
  ) {}
  async targets(user: string, publicId: string) {
    const b = await requireBusiness(this.db, user, publicId, "posts.manage");
    return this.db
      .selectFrom("post_target")
      .selectAll()
      .where("business_id", "=", b.id)
      .execute();
  }
  async connectTarget(
    user: string,
    publicId: string,
    body: Record<string, unknown>,
  ) {
    const b = await requireBusiness(
      this.db,
      user,
      publicId,
      "connections.manage",
    );
    const platform = body.platform;
    if (platform !== "telegram" && platform !== "vk") throw invalid();
    const connection = await this.db
      .selectFrom("business_connection as c")
      .innerJoin("connection_secret as s", "s.connection_id", "c.id")
      .select(["c.id", "c.external_account_id", "s.encrypted_token"])
      .where("c.business_id", "=", b.id)
      .where("c.platform", "=", platform)
      .where("c.status", "=", "connected")
      .executeTakeFirst();
    if (!connection)
      throw new AppError(
        409,
        "CONNECTION_REQUIRED",
        "Сначала подключите бота или сообщество.",
      );
    let externalId = "",
      title = "";
    let encrypted: string | null = null;
    if (platform === "telegram") {
      const channel = String(body.channel ?? "");
      if (!/^(@[a-zA-Z][\w]{3,}|-100\d+)$/.test(channel))
        throw invalid("Укажите @username или ID канала.");
      const token = decryptSecret(connection.encrypted_token, this.secret);
      const me = await telegramCall(token, "getMe", {}, this.transport);
      const chat = await telegramCall(
        token,
        "getChat",
        { chat_id: channel },
        this.transport,
      );
      if (chat?.type !== "channel" || !chat.id || !me?.id)
        throw invalid("Выберите Telegram-канал.");
      const member = await telegramCall(
        token,
        "getChatMember",
        { chat_id: chat.id, user_id: me.id },
        this.transport,
      );
      if (
        member?.status !== "creator" &&
        !(member?.status === "administrator" && member.can_post_messages)
      )
        throw invalid("Дайте боту право публикации в канале.");
      externalId = String(chat.id);
      title = chat.title ?? channel;
    } else {
      const token =
        typeof body.publishToken === "string" ? body.publishToken : "";
      if (token.length < 10 || token.length > 4096)
        throw invalid(
          "Нужен пользовательский ключ VK с правом публикации на стене.",
        );
      const permissions = Number(
        await vkCall(token, "account.getAppPermissions", {}, this.transport),
      );
      if (!Number.isSafeInteger(permissions) || (permissions & 8192) !== 8192)
        throw invalid("Пользовательскому ключу VK нужно право wall.");
      const group = (await vkCall(
        token,
        "groups.getById",
        { group_id: connection.external_account_id, fields: "is_admin" },
        this.transport,
      )) as { groups?: { id: number; name: string; is_admin: number }[] };
      const g = group.groups?.[0];
      if (
        !g ||
        String(g.id) !== connection.external_account_id ||
        g.is_admin !== 1
      )
        throw invalid(
          "Ключ должен принадлежать администратору подключённого сообщества.",
        );
      externalId = "-" + g.id;
      title = g.name;
      encrypted = encryptSecret(token, this.secret);
    }
    return this.db.transaction().execute(async (tx) => {
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, user, publicId, "connections.manage");
      const fresh = await tx
        .selectFrom("business_connection")
        .select(["status", "external_account_id"])
        .where("id", "=", connection.id)
        .executeTakeFirstOrThrow();
      if (
        fresh.status !== "connected" ||
        fresh.external_account_id !== connection.external_account_id
      )
        throw new AppError(
          409,
          "CONNECTION_CHANGED",
          "Подключение изменилось. Повторите проверку.",
        );
      if (encrypted)
        await tx
          .updateTable("connection_secret")
          .set({ encrypted_publish_token: encrypted })
          .where("connection_id", "=", connection.id)
          .execute();
      return tx
        .insertInto("post_target")
        .values({
          id: randomUUID(),
          business_id: b.id,
          connection_id: connection.id,
          platform,
          external_id: externalId,
          title,
        })
        .onConflict((oc) =>
          oc
            .columns(["business_id", "platform", "external_id"])
            .doUpdateSet({ connection_id: connection.id, title, active: true }),
        )
        .returning(["id", "title", "platform"])
        .executeTakeFirstOrThrow();
    });
  }
  async list(user: string, publicId: string, page = 0, filter = "all") {
    if (
      !Number.isSafeInteger(page) ||
      page < 0 ||
      page > 100000 ||
      !["all", "draft", "scheduled", "published", "failed"].includes(filter)
    )
      throw invalid("Проверьте фильтр и страницу.");
    const b = await requireBusiness(this.db, user, publicId, "posts.manage");
    let query = this.db
      .selectFrom("post")
      .selectAll()
      .where("business_id", "=", b.id)
      .where("deleted_at", "is", null)
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(100)
      .offset(page * 100);
    if (filter === "failed")
      query = query.where("status", "in", ["failed", "partial"]);
    else if (filter === "scheduled")
      query = query.where((eb) =>
        eb.or([
          eb("status", "=", "scheduled"),
          eb.exists(
            eb
              .selectFrom("post_schedule")
              .select("post_id")
              .whereRef("post_schedule.post_id", "=", "post.id")
              .where("active", "=", true),
          ),
        ]),
      );
    else if (filter !== "all")
      query = query.where("status", "=", filter as "draft" | "published");
    const posts = await query.execute();
    return Promise.all(
      posts.map(async (p) => ({
        ...p,
        attachments: await this.db
          .selectFrom("post_attachment as pa")
          .innerJoin("attachment as a", "a.id", "pa.attachment_id")
          .select(["a.id", "a.filename", "a.type"])
          .where("pa.post_id", "=", p.id)
          .orderBy("pa.position")
          .execute(),
        deliveries: await this.db
          .selectFrom("post_delivery as d")
          .innerJoin("post_target as t", "t.id", "d.target_id")
          .selectAll("d")
          .select(["t.title", "t.platform"])
          .where("d.post_id", "=", p.id)
          .execute(),
        schedule: await this.db
          .selectFrom("post_schedule")
          .selectAll()
          .where("post_id", "=", p.id)
          .executeTakeFirst(),
      })),
    );
  }
  async save(
    user: string,
    publicId: string,
    body: Record<string, unknown>,
    postId?: string,
  ) {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (
      (!text &&
        !(Array.isArray(body.attachments) && body.attachments.length)) ||
      text.length > 4096
    )
      throw invalid("Введите текст до 4096 символов.");
    const platformText = (key: "text_telegram" | "text_vk" | "textTelegram" | "textVk") => {
      const camel =
        key === "text_telegram" || key === "textTelegram"
          ? body.text_telegram ?? body.textTelegram
          : body.text_vk ?? body.textVk;
      if (camel == null || camel === "") return null;
      if (typeof camel !== "string" || camel.length > 4096)
        throw invalid("Текст для площадки — до 4096 символов.");
      const trimmed = camel.trim();
      return trimmed || null;
    };
    const textTelegram = platformText("text_telegram");
    const textVk = platformText("text_vk");
    const attachments = Array.isArray(body.attachments)
      ? [...new Set(body.attachments.map(String))]
      : [];
    if (
      attachments.length > 10 ||
      attachments.some(
        (id) =>
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
            id,
          ),
      )
    )
      throw invalid("Проверьте вложения.");
    const targets = Array.isArray(body.targets)
      ? [...new Set(body.targets.map(String))]
      : [];
    if (
      !targets.length ||
      targets.length > 10 ||
      targets.some(
        (t) =>
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
            t,
          ),
      )
    )
      throw invalid("Выберите площадки.");
    const buttons = Array.isArray(body.buttons)
      ? (body.buttons as { text: string; url: string }[])
      : [];
    if (
      buttons.length > 10 ||
      buttons.some(
        (b) =>
          !b ||
          typeof b.text !== "string" ||
          !b.text.trim() ||
          b.text.length > 50 ||
          typeof b.url !== "string" ||
          b.url.length > 2000 ||
          !validLink(b.url),
      )
    )
      throw invalid("Для кнопок нужны название и HTTPS-ссылка.");
    const action = String(body.action ?? "draft");
    if (!["draft", "schedule", "now"].includes(action)) throw invalid();
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, user, publicId, "posts.manage");
      const business = await tx
        .selectFrom("business")
        .select("timezone")
        .where("id", "=", b.id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      await requireBusiness(tx, user, publicId, "posts.manage");
      await assertEntitlement(tx, b.id, "autopost");
      const targetRows = await tx
        .selectFrom("post_target")
        .selectAll()
        .where("business_id", "=", b.id)
        .where("id", "in", targets)
        .where("active", "=", true)
        .execute();
      if (targetRows.length !== targets.length)
        throw invalid("Площадка недоступна.");
      const files = attachments.length
        ? await tx
            .selectFrom("attachment")
            .selectAll()
            .where("business_id", "=", b.id)
            .where("id", "in", attachments)
            .execute()
        : [];
      if (
        files.length !== attachments.length ||
        files.some(
          (f) =>
            !["image", "video"].includes(f.type) ||
            f.provider !== "storage" ||
            (f.type === "image" && Number(f.size_bytes) > 10485760),
        ) ||
        files.reduce((n, f) => n + Number(f.size_bytes), 0) > 104857600
      )
        throw invalid(
          "Выберите фото до 10 МБ или видео до 50 МБ, суммарно до 100 МБ.",
        );
      const rule = body.recurrence
        ? recurrence({
            ...(body.recurrence as object),
            timezone: business.timezone,
          })
        : null;
      let scheduled: Date | null = null;
      if (action === "now") scheduled = new Date();
      if (action === "schedule" && !rule) {
        const date = String(body.date ?? ""),
          time = String(body.time ?? "");
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
          throw invalid("Проверьте время.");
        scheduled =
          localInstants(
            date,
            Number(time.slice(0, 2)) * 60 + Number(time.slice(3)),
            business.timezone,
          )[0] ?? null;
        if (!scheduled || +scheduled <= Date.now())
          throw invalid("Выберите будущее время в часовом поясе бизнеса.");
      }
      const status = action === "draft" || rule ? "draft" : "scheduled";
      const key = String(body.request_key ?? "");
      if (!postId && !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw invalid();
      const hash = createHash("sha256")
        .update(
          JSON.stringify({
            text,
            textTelegram,
            textVk,
            attachments,
            targets: targets.sort(),
            buttons,
            action,
            date: body.date,
            time: body.time,
            rule,
          }),
        )
        .digest("hex");
      if (!postId) {
        const old = await tx
          .selectFrom("post")
          .selectAll()
          .where("business_id", "=", b.id)
          .where("request_key", "=", key)
          .executeTakeFirst();
        if (old) {
          if (old.request_hash !== hash)
            throw new AppError(
              409,
              "REQUEST_CONFLICT",
              "Запрос уже использован.",
            );
          return old;
        }
      }
      const old = postId
        ? await tx
            .selectFrom("post")
            .selectAll()
            .where("business_id", "=", b.id)
            .where("id", "=", postId)
            .forUpdate()
            .executeTakeFirst()
        : null;
      if (
        postId &&
        (!old ||
          old.deleted_at ||
          !["draft", "scheduled"].includes(old.status) ||
          body.revision !== old.revision)
      )
        throw new AppError(
          409,
          "POST_CHANGED",
          "Публикация уже изменена или отправляется.",
        );
      const id = postId ?? randomUUID();
      const values = {
        text,
        text_telegram: textTelegram,
        text_vk: textVk,
        buttons: JSON.stringify(buttons),
        status: status as "draft" | "scheduled",
        scheduled_at: scheduled,
        request_hash: hash,
        updated_at: new Date(),
      };
      if (old)
        await tx
          .updateTable("post")
          .set({ ...values, revision: old.revision + 1 })
          .where("id", "=", id)
          .execute();
      else
        await tx
          .insertInto("post")
          .values({
            ...values,
            id,
            business_id: b.id,
            created_by: user,
            request_key: key,
          })
          .execute();
      await tx
        .deleteFrom("post_attachment")
        .where("post_id", "=", id)
        .execute();
      for (const [position, attachment_id] of attachments.entries())
        await tx
          .insertInto("post_attachment")
          .values({ business_id: b.id, post_id: id, attachment_id, position })
          .execute();
      await tx.deleteFrom("post_delivery").where("post_id", "=", id).execute();
      for (const target_id of targets)
        await tx
          .insertInto("post_delivery")
          .values({
            id: randomUUID(),
            business_id: b.id,
            post_id: id,
            target_id,
            external_message_id: null,
            last_error: null,
          })
          .execute();
      await tx
        .updateTable("post")
        .set({ status: "cancelled" })
        .where("template_id", "=", id)
        .where("status", "=", "scheduled")
        .execute();
      if (rule && action === "schedule") {
        const next = nextOccurrence(rule, new Date());
        if (!next) throw invalid("В расписании нет будущих публикаций.");
        await tx
          .insertInto("post_schedule")
          .values({
            post_id: id,
            business_id: b.id,
            rule: JSON.stringify(rule),
            next_at: next,
            active: true,
          })
          .onConflict((oc) =>
            oc.column("post_id").doUpdateSet({
              rule: JSON.stringify(rule),
              next_at: next,
              active: true,
              revision: (old?.revision ?? 0) + 1,
            }),
          )
          .execute();
      } else
        await tx
          .updateTable("post_schedule")
          .set({ active: false, next_at: null })
          .where("post_id", "=", id)
          .execute();
      await tx
        .insertInto("business_audit_log")
        .values({
          id: randomUUID(),
          business_id: b.id,
          actor_user_id: user,
          action: action === "draft" ? "post_created" : "post_scheduled",
          target_user_id: null,
          details: id,
        })
        .execute();
      return tx
        .selectFrom("post")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
    });
  }
  async action(user: string, publicId: string, id: string, action: unknown) {
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, user, publicId, "posts.manage");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, user, publicId, "posts.manage");
      const p = await tx
        .selectFrom("post")
        .selectAll()
        .where("business_id", "=", b.id)
        .where("id", "=", id)
        .forUpdate()
        .executeTakeFirst();
      if (!p || p.deleted_at)
        throw new AppError(404, "POST_NOT_FOUND", "Публикация не найдена.");
      const deliveries = await tx
        .selectFrom("post_delivery")
        .selectAll()
        .where("post_id", "=", id)
        .execute();
      if (action === "duplicate") {
        const copy = randomUUID();
        await tx
          .insertInto("post")
          .values({
            id: copy,
            business_id: b.id,
            text: p.text,
            buttons: p.buttons,
            status: "draft",
            scheduled_at: null,
            created_by: user,
            request_key: randomUUID(),
            request_hash: p.request_hash,
          })
          .execute();
        for (const d of deliveries)
          await tx
            .insertInto("post_delivery")
            .values({
              id: randomUUID(),
              business_id: b.id,
              post_id: copy,
              target_id: d.target_id,
              external_message_id: null,
              last_error: null,
            })
            .execute();
        const files = await tx
          .selectFrom("post_attachment")
          .selectAll()
          .where("post_id", "=", id)
          .execute();
        for (const f of files)
          await tx
            .insertInto("post_attachment")
            .values({ ...f, post_id: copy })
            .execute();
        return { id: copy };
      }
      if (action === "retry") {
        if (
          !["failed", "partial"].includes(p.status) ||
          deliveries.some((d) => d.status === "uncertain")
        )
          throw new AppError(
            409,
            "DELIVERY_UNCERTAIN",
            "Проверьте результат на площадке: повторная отправка может создать дубль.",
          );
        for (const d of deliveries.filter((x) => x.status === "failed")) {
          await tx
            .deleteFrom("telegram_outbox")
            .where("post_delivery_id", "=", d.id)
            .where("delivery_state", "=", "failed")
            .execute();
          await tx
            .deleteFrom("vk_outbox")
            .where("post_delivery_id", "=", d.id)
            .where("delivery_state", "=", "failed")
            .execute();
          await tx
            .updateTable("post_delivery")
            .set({ status: "pending", last_error: null })
            .where("id", "=", d.id)
            .execute();
        }
        await tx
          .updateTable("post")
          .set({ status: "scheduled", scheduled_at: new Date() })
          .where("id", "=", id)
          .execute();
        return { ok: true };
      }
      if (action === "now" && p.status === "draft") {
        await tx
          .updateTable("post")
          .set({ status: "scheduled", scheduled_at: new Date() })
          .where("id", "=", id)
          .execute();
        return { ok: true };
      }
      if (
        (action === "cancel" || action === "delete") &&
        ["draft", "scheduled", "cancelled"].includes(p.status)
      ) {
        await tx
          .updateTable("post_schedule")
          .set({ active: false, next_at: null })
          .where("post_id", "=", id)
          .execute();
        await tx
          .updateTable("post")
          .set({ status: "cancelled" })
          .where("template_id", "=", id)
          .where("status", "=", "scheduled")
          .execute();
        await tx
          .updateTable("post")
          .set({ status: "cancelled", updated_at: new Date() })
          .where("id", "=", id)
          .execute();
        await tx
          .updateTable("post_delivery")
          .set({ status: "cancelled" })
          .where("post_id", "=", id)
          .where("status", "=", "pending")
          .execute();
        await audit(tx, b.id, user, "post_cancelled", id, { action });
        if (action === "delete")
          await tx
            .updateTable("post")
            .set({ deleted_at: new Date() })
            .where("id", "=", id)
            .execute();
        return { ok: true };
      }
      throw new AppError(
        409,
        "POST_LOCKED",
        "Действие недоступно для этого статуса.",
      );
    });
  }
}
