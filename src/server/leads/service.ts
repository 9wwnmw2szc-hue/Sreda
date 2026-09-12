import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type { Database, LeadStatus } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";

type Input = { source: "telegram" | "vk" | "max"; name: string; phone?: string | null; message?: string | null; externalEventId?: string | null };
const statuses: LeadStatus[] = ["new", "processing", "closed"];
function clean(input: unknown): Input {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AppError(400, "INVALID_LEAD", "Проверьте данные заявки.");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !["source", "name", "phone", "message", "externalEventId"].includes(key))) throw new AppError(400, "INVALID_LEAD", "Проверьте данные заявки.");
  if (!["telegram", "vk", "max"].includes(String(value.source))) throw new AppError(400, "INVALID_LEAD", "Неизвестный канал заявки.");
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) throw new AppError(400, "INVALID_LEAD", "Укажите имя клиента.");
  const optional = (key: string, max: number) => value[key] == null ? null : typeof value[key] === "string" && value[key].length <= max ? value[key].trim() || null : (() => { throw new AppError(400, "INVALID_LEAD", "Проверьте данные заявки."); })();
  return { source: value.source as Input["source"], name, phone: optional("phone", 40), message: optional("message", 2000), externalEventId: optional("externalEventId", 200) };
}

export class LeadService {
  constructor(private readonly db: Kysely<Database>) {}
  private async resolve(userId: string, publicId: string) {
    const row = await this.db.selectFrom("business_member").innerJoin("business", "business.id", "business_member.business_id").select("business.id").where("business.public_id", "=", publicId).where("business.archived_at", "is", null).where("business_member.user_id", "=", userId).where("business_member.status", "=", "active").executeTakeFirst();
    if (!row) throw new AppError(404, "BUSINESS_NOT_FOUND", "Бизнес не найден.");
    return row.id;
  }
  async list(userId: string, businessId: string, status?: LeadStatus) {
    const publicBusinessId = businessId;
    businessId = await this.resolve(userId, businessId);
    if (status && !statuses.includes(status)) throw new AppError(400, "INVALID_STATUS", "Неизвестный статус.");
    let query = this.db.selectFrom("lead").selectAll().where("business_id", "=", businessId).orderBy("created_at", "desc").limit(100);
    if (status) query = query.where("status", "=", status) as typeof query;
    return (await query.execute()).map((lead) => this.toLead(lead, publicBusinessId));
  }
  async create(userId: string, businessId: string, raw: unknown) {
    const publicBusinessId = businessId;
    const input = clean(raw);
    businessId = await this.resolve(userId, businessId);
    if (input.externalEventId) {
      const existing = await this.db.selectFrom("lead").selectAll().where("business_id", "=", businessId).where("source", "=", input.source).where("external_event_id", "=", input.externalEventId).executeTakeFirst();
      if (existing) return this.toLead(existing, publicBusinessId);
    }
    const inserted = await this.db.insertInto("lead").values({ id: randomUUID(), business_id: businessId, source: input.source, name: input.name, phone: input.phone ?? null, message: input.message ?? null, status: "new", external_event_id: input.externalEventId ?? null }).onConflict((oc) => oc.columns(["business_id", "source", "external_event_id"]).doNothing()).returningAll().executeTakeFirst();
    const row = inserted ?? await this.db.selectFrom("lead").selectAll().where("business_id", "=", businessId).where("source", "=", input.source).where("external_event_id", "=", input.externalEventId!).executeTakeFirstOrThrow();
    return this.toLead(row, publicBusinessId);
  }
  async updateStatus(userId: string, businessId: string, id: string, status: unknown) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AppError(404, "LEAD_NOT_FOUND", "Заявка не найдена.");
    if (typeof status !== "string" || !statuses.includes(status as LeadStatus)) throw new AppError(400, "INVALID_STATUS", "Неизвестный статус.");
    const internalBusinessId = await this.resolve(userId, businessId);
    const membership = await this.db.selectFrom("business_member").select("business_id").where("business_id", "=", internalBusinessId).where("user_id", "=", userId).where("status", "=", "active").where("role", "in", ["owner", "admin", "operator"]).executeTakeFirst();
    if (!membership) throw new AppError(404, "BUSINESS_NOT_FOUND", "Бизнес не найден.");
    const row = await this.db.updateTable("lead").set({ status: status as LeadStatus, updated_at: new Date() }).where("id", "=", id).where("business_id", "=", internalBusinessId).returningAll().executeTakeFirst();
    if (!row) throw new AppError(404, "LEAD_NOT_FOUND", "Заявка не найдена.");
    return this.toLead(row, businessId);
  }
  private toLead(lead: Selectable<Database["lead"]>, businessId: string) { return { id: lead.id, businessId, source: lead.source, name: lead.name, phone: lead.phone ?? undefined, message: lead.message ?? undefined, status: lead.status, createdAt: lead.created_at.toISOString() }; }
}
