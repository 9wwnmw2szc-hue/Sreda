import { localInstants } from "../booking/time.ts";
import { randomUUID } from "node:crypto";
import type { Kysely, Selectable, Transaction } from "kysely";
import { sql } from "kysely";
import type { Database, LeadStatus } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";

import { matchClient, clientActivity } from "../clients/service.ts";
import { notify } from "../notifications/service.ts";
import { requireBusiness } from "../access/permissions.ts";
type Input = {
  source: "telegram" | "vk" | "max";
  name: string;
  phone?: string | null;
  message?: string | null;
  externalEventId?: string | null;
};
const statuses: LeadStatus[] = [
  "new",
  "processing",
  "waiting_customer",
  "completed",
  "rejected",
  "closed",
];

async function recordStatusHistory(
  tx: Transaction<Database>,
  businessId: string,
  leadId: string,
  fromStatus: string | null,
  toStatus: string,
  actorUserId: string | null,
  note = "",
) {
  await tx
    .insertInto("lead_status_history")
    .values({
      id: randomUUID(),
      business_id: businessId,
      lead_id: leadId,
      from_status: fromStatus,
      to_status: toStatus,
      actor_user_id: actorUserId,
      note,
    })
    .execute();
}
function clean(input: unknown): Input {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AppError(400, "INVALID_LEAD", "Проверьте данные заявки.");
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some(
      (key) =>
        !["source", "name", "phone", "message", "externalEventId"].includes(
          key,
        ),
    )
  )
    throw new AppError(400, "INVALID_LEAD", "Проверьте данные заявки.");
  if (!["telegram", "vk", "max"].includes(String(value.source)))
    throw new AppError(400, "INVALID_LEAD", "Неизвестный канал заявки.");
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name))
    throw new AppError(400, "INVALID_LEAD", "Укажите имя клиента.");
  const optional = (key: string, max: number) =>
    value[key] == null
      ? null
      : typeof value[key] === "string" && value[key].length <= max
        ? value[key].trim() || null
        : (() => {
            throw new AppError(400, "INVALID_LEAD", "Проверьте данные заявки.");
          })();
  return {
    source: value.source as Input["source"],
    name,
    phone: optional("phone", 40),
    message: optional("message", 2000),
    externalEventId: optional("externalEventId", 200),
  };
}

export class LeadService {
  constructor(private readonly db: Kysely<Database>) {}
  private async resolve(userId: string, publicId: string) {
    const row = await this.db
      .selectFrom("business_member")
      .innerJoin("business", "business.id", "business_member.business_id")
      .select("business.id")
      .where("business.public_id", "=", publicId)
      .where("business.archived_at", "is", null)
      .where("business_member.user_id", "=", userId)
      .where("business_member.status", "=", "active")
      .executeTakeFirst();
    if (!row)
      throw new AppError(404, "BUSINESS_NOT_FOUND", "Бизнес не найден.");
    return row.id;
  }
  async list(
    userId: string,
    businessId: string,
    status?: LeadStatus,
    before?: string,
    filters: {
      search?: string;
      source?: string;
      from?: string;
      until?: string;
    } = {},
  ) {
    const publicBusinessId = businessId;
    businessId = await this.resolve(userId, businessId);
    if (status && !statuses.includes(status))
      throw new AppError(400, "INVALID_STATUS", "Неизвестный статус.");
    // API dates have millisecond precision; cursor ordering must use the same precision.
    const created = sql<Date>`date_trunc('milliseconds', created_at)`;
    let query = this.db
      .selectFrom("lead")
      .selectAll()
      .where("business_id", "=", businessId)
      .orderBy(created, "desc")
      .orderBy("id", "desc")
      .limit(100);
    if (before) {
      const [date, id, extra] = before.split("|");
      if (
        !date ||
        !id ||
        extra !== undefined ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        throw new AppError(400, "INVALID_CURSOR", "Обновите список заявок.");
      query = query.where((eb) =>
        eb.or([
          eb(created, "<", new Date(date)),
          eb.and([eb(created, "=", new Date(date)), eb("id", "<", id)]),
        ]),
      );
    }
    if (filters.search) {
      if (filters.search.length > 100)
        throw new AppError(400, "INVALID_SEARCH", "Слишком длинный запрос.");
      query = query.where((eb) =>
        eb.or([
          eb("name", "ilike", "%" + filters.search + "%"),
          eb("phone", "ilike", "%" + filters.search + "%"),
        ]),
      );
    }
    if (filters.source) {
      if (!["telegram", "vk", "max"].includes(filters.source))
        throw new AppError(400, "INVALID_SOURCE", "Проверьте источник.");
      query = query.where("source", "=", filters.source as Input["source"]);
    }
    for (const [key, op] of [
      ["from", ">="],
      ["until", "<"],
    ] as const) {
      const value = filters[key];
      if (value) {
        if (!Number.isFinite(Date.parse(value)))
          throw new AppError(400, "INVALID_DATE", "Проверьте период.");
        const tz = (
          await this.db
            .selectFrom("business")
            .select("timezone")
            .where("id", "=", businessId)
            .executeTakeFirstOrThrow()
        ).timezone;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? localInstants(value, 0, tz)[0]
          : new Date(value);
        if (!date)
          throw new AppError(
            400,
            "INVALID_DATE",
            "Эта дата недоступна в часовом поясе бизнеса.",
          );
        query = query.where("created_at", op, date);
      }
    }
    if (status) query = query.where("status", "=", status) as typeof query;
    return Promise.all(
      (await query.execute()).map(async (lead) => ({
        ...this.toLead(lead, publicBusinessId),
        processingName: lead.processing_by
          ? (
              await this.db
                .selectFrom("user")
                .select("name")
                .where("id", "=", lead.processing_by)
                .executeTakeFirst()
            )?.name
          : undefined,
      })),
    );
  }
  async create(userId: string, publicId: string, raw: unknown) {
    const input = clean(raw);
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "leads.write");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, publicId, "leads.write");
      const lead = await createLead(tx, b.id, input);
      return this.toLead(lead, publicId);
    });
  }
  async updateStatus(
    userId: string,
    businessId: string,
    id: string,
    status: unknown,
  ) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new AppError(404, "LEAD_NOT_FOUND", "Заявка не найдена.");
    if (typeof status !== "string" || !statuses.includes(status as LeadStatus))
      throw new AppError(400, "INVALID_STATUS", "Неизвестный статус.");
    const internalBusinessId = await this.resolve(userId, businessId);
    const membership = await this.db
      .selectFrom("business_member")
      .select("business_id")
      .where("business_id", "=", internalBusinessId)
      .where("user_id", "=", userId)
      .where("status", "=", "active")
      .where("role", "in", ["owner", "admin", "operator"])
      .executeTakeFirst();
    if (!membership)
      throw new AppError(404, "BUSINESS_NOT_FOUND", "Бизнес не найден.");
    return this.db.transaction().execute(async (tx) => {
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", internalBusinessId)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, businessId, "leads.write");
      const current = await tx
        .selectFrom("lead")
        .selectAll()
        .where("business_id", "=", internalBusinessId)
        .where("id", "=", id)
        .forUpdate()
        .executeTakeFirst();
      if (!current)
        throw new AppError(404, "LEAD_NOT_FOUND", "Заявка не найдена.");
      if (current.processing_by && current.processing_by !== userId)
        throw new AppError(
          409,
          "LEAD_ASSIGNED",
          "Заявка уже в работе у другого сотрудника.",
        );
      const next = status as LeadStatus;
      const row = await tx
        .updateTable("lead")
        .set({
          status: next,
          updated_at: new Date(),
          ...(next === "processing"
            ? {
                processing_by: userId,
                processing_at: current.processing_at ?? new Date(),
              }
            : next === "new"
              ? { processing_by: null, processing_at: null }
              : {}),
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
      if (current.status !== next) {
        await recordStatusHistory(
          tx,
          internalBusinessId,
          id,
          current.status,
          next,
          userId,
        );
        if (row.client_id)
          await clientActivity(
            tx,
            internalBusinessId,
            row.client_id,
            "lead." + next,
            randomUUID(),
            id,
            userId,
          );
        if (
          next === "processing" ||
          next === "closed" ||
          next === "completed" ||
          next === "rejected"
        )
          await tx
            .insertInto("business_audit_log")
            .values({
              id: randomUUID(),
              business_id: internalBusinessId,
              actor_user_id: userId,
              action: next === "processing" ? "lead_taken" : "lead_closed",
              target_user_id: null,
              details: id,
            })
            .execute();
      }
      return this.toLead(row, businessId);
    });
  }
  private toLead(lead: Selectable<Database["lead"]>, businessId: string) {
    return {
      id: lead.id,
      businessId,
      source: lead.source,
      name: lead.name,
      phone: lead.phone ?? undefined,
      message: lead.message ?? undefined,
      status: lead.status,
      clientId: lead.client_id,
      processingBy: lead.processing_by,
      processingAt: lead.processing_at?.toISOString(),
      answers: lead.answers,
      updatedAt: lead.updated_at.toISOString(),
      createdAt: lead.created_at.toISOString(),
    };
  }
}

export async function createLead(
  tx: Transaction<Database>,
  businessId: string,
  input: Input & {
    platformUserId?: string;
    username?: string;
    answers?: Record<string, string>;
  },
) {
  await tx
    .selectFrom("business")
    .select("id")
    .where("id", "=", businessId)
    .forUpdate()
    .execute();
  if (input.externalEventId) {
    const existing = await tx
      .selectFrom("lead")
      .selectAll()
      .where("business_id", "=", businessId)
      .where("source", "=", input.source)
      .where("external_event_id", "=", input.externalEventId)
      .executeTakeFirst();
    if (existing) return existing;
  }
  const clientId = await matchClient(tx, businessId, {
    name: input.name,
    phone: input.phone,
    email: input.answers?.email || null,
    identities:
      input.platformUserId && input.source !== "max"
        ? [
            {
              kind: input.source,
              value: input.platformUserId,
              username: input.username,
            },
          ]
        : [],
  });
  const lead = await tx
    .insertInto("lead")
    .values({
      id: randomUUID(),
      business_id: businessId,
      client_id: clientId,
      source: input.source,
      name: input.name,
      phone: input.phone ?? null,
      message: input.message ?? null,
      status: "new",
      external_event_id: input.externalEventId ?? null,
      answers: JSON.stringify(input.answers ?? {}),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await recordStatusHistory(tx, businessId, lead.id, null, "new", null);
  await clientActivity(
    tx,
    businessId,
    clientId,
    "lead.created",
    "lead:" + lead.id,
    lead.id,
  );
  await notify(
    tx,
    businessId,
    "lead.created",
    "lead:" + lead.id,
    "Новая заявка: " +
      input.name +
      "\nТелефон: " +
      (input.phone || "—") +
      "\nИсточник: " +
      input.source +
      (input.answers?.service ? "\nУслуга: " + input.answers.service : ""),
    "/leads",
  );
  return lead;
}
