import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { encryptSecret } from "./crypto.ts";

export class ConnectionService {
  constructor(private readonly db: Kysely<Database>, private readonly secret: string, private readonly fetchTelegram: typeof fetch = fetch) {}
  private async business(userId: string, publicId: string) {
    const row = await this.db.selectFrom("business_member as member").innerJoin("business", "business.id", "member.business_id").select(["business.id", "member.role"]).where("business.public_id", "=", publicId).where("business.archived_at", "is", null).where("member.user_id", "=", userId).where("member.status", "=", "active").executeTakeFirst();
    if (!row) throw new AppError(404, "BUSINESS_NOT_FOUND", "Бизнес не найден.");
    if (row.role !== "owner" && row.role !== "admin") throw new AppError(403, "FORBIDDEN", "Недостаточно прав для управления подключениями.");
    return row.id;
  }
  private async audit(db: Kysely<Database>, businessId: string, actorUserId: string, action: "connection_connected" | "connection_disconnected") {
    await db.insertInto("business_audit_log").values({ id: randomUUID(), business_id: businessId, actor_user_id: actorUserId, action, target_user_id: null, details: "Сохранение или удаление токена; запуск обработки сообщений отдельно." }).execute();
  }
  async list(userId: string, publicId: string) {
    const businessId = await this.business(userId, publicId);
    return this.db.selectFrom("business_connection").select(["id", "platform", "display_name as displayName", "status", "created_at as createdAt", "updated_at as updatedAt"]).where("business_id", "=", businessId).orderBy("platform").execute();
  }
  async connect(userId: string, publicId: string, raw: unknown) {
    const businessId = await this.business(userId, publicId);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new AppError(400, "INVALID_CONNECTION", "Проверьте данные подключения.");
    const body = raw as Record<string, unknown>; const platform = body.platform; const token = body.token;
    if (platform !== "telegram" && platform !== "vk") throw new AppError(400, "INVALID_CONNECTION", "Выберите Telegram или VK.");
    if (typeof token !== "string" || token.length < 10 || token.length > 4096) throw new AppError(400, "INVALID_CONNECTION", "Проверьте токен подключения.");
    let externalAccountId: string | null = null; let displayName = platform === "telegram" ? "Telegram" : "VK"; let status: "pending" | "connected" = "pending";
    if (platform === "telegram") {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await this.fetchTelegram(`https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`, { signal: controller.signal, cache: "no-store", redirect: "error" });
        const payload = await response.json().catch(() => null) as { ok?: boolean; result?: { id?: number; is_bot?: boolean; username?: string; first_name?: string } } | null;
        if (!response.ok || !payload?.ok || !Number.isSafeInteger(payload.result?.id) || !payload.result?.is_bot) throw new AppError(400, "INVALID_CONNECTION", "Telegram не подтвердил этот токен.");
        externalAccountId = String(payload.result.id); displayName = payload.result.username ? `@${payload.result.username}` : payload.result.first_name ?? "Telegram"; status = "connected";
      } catch (error) { if (error instanceof AppError) throw error; throw new AppError(503, "CHANNEL_UNAVAILABLE", "Telegram временно недоступен. Попробуйте позже."); } finally { clearTimeout(timer); }
    }
    const id = randomUUID();
    try {
      await this.db.transaction().execute(async (tx) => {
        await tx.selectFrom("business").select("id").where("id", "=", businessId).forUpdate().execute();
        await new ConnectionService(tx, this.secret, this.fetchTelegram).business(userId, publicId);
        await tx.insertInto("business_connection").values({ id, business_id: businessId, platform, external_account_id: externalAccountId, display_name: displayName, status }).onConflict((oc) => oc.columns(["business_id", "platform"]).doUpdateSet({ external_account_id: externalAccountId, display_name: displayName, status, updated_at: new Date() })).execute();
        const connection = await tx.selectFrom("business_connection").select("id").where("business_id", "=", businessId).where("platform", "=", platform).executeTakeFirstOrThrow();
        await tx.insertInto("connection_secret").values({ connection_id: connection.id, encrypted_token: encryptSecret(token, this.secret), key_version: 1 }).onConflict((oc) => oc.column("connection_id").doUpdateSet({ encrypted_token: encryptSecret(token, this.secret), key_version: 1, updated_at: new Date() })).execute();
        await this.audit(tx, businessId, userId, "connection_connected");
      });
    } catch (error) { if ((error as { code?: string }).code === "23505") throw new AppError(409, "CONNECTION_EXISTS", "Подключение уже существует."); throw error; }
    return { ok: true, status };
  }

  async disconnect(userId: string, publicId: string, platform: unknown) {
    const businessId = await this.business(userId, publicId);
    if (platform !== "telegram" && platform !== "vk") throw new AppError(400, "INVALID_CONNECTION", "Неизвестный канал.");
    const row = await this.db.selectFrom("business_connection").select("id").where("business_id", "=", businessId).where("platform", "=", platform).executeTakeFirst();
    if (!row) throw new AppError(404, "CONNECTION_NOT_FOUND", "Подключение не найдено.");
    await this.db.transaction().execute(async (tx) => {
      await tx.selectFrom("business").select("id").where("id", "=", businessId).forUpdate().execute();
      await new ConnectionService(tx, this.secret, this.fetchTelegram).business(userId, publicId);
      await tx.deleteFrom("connection_secret").where("connection_id", "=", row.id).execute();
      await tx.updateTable("business_connection").set({ status: "disconnected", external_account_id: null, updated_at: new Date() }).where("id", "=", row.id).execute();
      await this.audit(tx, businessId, userId, "connection_disconnected");
    });
    return { ok: true };
  }
}
