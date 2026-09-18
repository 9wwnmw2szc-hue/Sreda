import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { requireBusiness, allowed } from "../access/permissions.ts";
import { audit } from "../audit/service.ts";
import {
  cancelReminders,
  parseOffsets,
  scheduleReminders,
} from "./reminders.ts";
import type { CalendarEventType } from "./schema.ts";

const fail = (message = "Проверьте параметры события.") =>
  new AppError(400, "INVALID_CALENDAR_EVENT", message);

const EVENT_TYPES: CalendarEventType[] = [
  "note",
  "task",
  "meeting",
  "reminder",
  "blocked_time",
  "other",
];

function id(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw fail();
  return value;
}

function optionalId(value: unknown) {
  if (value == null || value === "") return null;
  return id(value);
}

async function assertActiveMember(
  tx: Transaction<Database>,
  businessId: string,
  userId: string | null,
) {
  if (!userId) return null;
  const member = await tx
    .selectFrom("business_member")
    .select(["user_id", "role", "status"])
    .where("business_id", "=", businessId)
    .where("user_id", "=", userId)
    .where("status", "=", "active")
    .executeTakeFirst();
  if (!member)
    throw new AppError(
      400,
      "INVALID_ASSIGNEE",
      "Назначьте активного участника этого бизнеса.",
    );
  return userId;
}

function title(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw fail("Укажите название до 200 символов.");
  return value.trim();
}

function description(value: unknown) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > 4000)
    throw fail("Описание слишком длинное.");
  return value;
}

function eventType(value: unknown): CalendarEventType {
  if (typeof value !== "string" || !EVENT_TYPES.includes(value as CalendarEventType))
    throw fail("Проверьте тип события.");
  return value as CalendarEventType;
}

function when(value: unknown, label: string) {
  const date = new Date(String(value));
  if (!Number.isFinite(+date)) throw fail(`Проверьте ${label}.`);
  return date;
}

/** Reject pending/confirmed bookings that overlap a blocked_time window. */
export async function assertBlockedTimeClearOfBookings(
  tx: Transaction<Database>,
  businessId: string,
  specialistId: string | null,
  startsAt: Date,
  endsAt: Date,
) {
  let query = tx
    .selectFrom("booking")
    .select("id")
    .where("business_id", "=", businessId)
    .where("status", "in", ["pending", "confirmed"])
    .where("occupied_from", "<", endsAt)
    .where("occupied_until", ">", startsAt)
    .forUpdate();
  if (specialistId) query = query.where("specialist_id", "=", specialistId);
  const overlap = await query.executeTakeFirst();
  if (overlap)
    throw new AppError(
      409,
      "CALENDAR_BLOCK_CONFLICT",
      "На это время уже есть запись. Сначала перенесите или отмените её.",
    );
}

/** Reject bookings that overlap blocked_time calendar events. */
export async function assertNoBlockedTimeOverlap(
  tx: Transaction<Database>,
  businessId: string,
  specialistId: string,
  from: Date,
  until: Date,
  excludeEventId?: string,
) {
  let query = tx
    .selectFrom("calendar_event")
    .select("id")
    .where("business_id", "=", businessId)
    .where("event_type", "=", "blocked_time")
    .where("status", "<>", "cancelled")
    .where("starts_at", "<", until)
    .where((eb) =>
      eb.or([eb("ends_at", "is", null), eb("ends_at", ">", from)]),
    )
    .where((eb) =>
      eb.or([
        eb("specialist_id", "is", null),
        eb("specialist_id", "=", specialistId),
      ]),
    )
    .forUpdate();
  if (excludeEventId) query = query.where("id", "!=", excludeEventId);
  const blocked = await query.executeTakeFirst();
  if (blocked)
    throw new AppError(
      409,
      "BOOKING_SLOT_UNAVAILABLE",
      "Это время заблокировано в календаре.",
    );
}

export async function blockedBusyIntervals(
  tx: Kysely<Database>,
  businessId: string,
  specialistId: string,
  from: Date,
  until: Date,
) {
  const rows = await tx
    .selectFrom("calendar_event")
    .select(["starts_at", "ends_at"])
    .where("business_id", "=", businessId)
    .where("event_type", "=", "blocked_time")
    .where("status", "<>", "cancelled")
    .where("starts_at", "<", until)
    .where((eb) =>
      eb.or([eb("ends_at", "is", null), eb("ends_at", ">", from)]),
    )
    .where((eb) =>
      eb.or([
        eb("specialist_id", "is", null),
        eb("specialist_id", "=", specialistId),
      ]),
    )
    .execute();
  return rows.map((row) => ({
    from: row.starts_at,
    until: row.ends_at ?? new Date(+row.starts_at + 60000),
  }));
}

export class CalendarService {
  constructor(private db: Kysely<Database>) {}

  async listRange(
    userId: string,
    publicId: string,
    fromRaw: string,
    toRaw: string,
    filters: {
      specialistIds?: string[];
      types?: string[];
      onlyMine?: boolean;
      includeBookings?: boolean;
    } = {},
  ) {
    const b = await requireBusiness(this.db, userId, publicId, "booking.write");
    const from = when(fromRaw, "начало периода");
    const to = when(toRaw, "конец периода");
    if (+to < +from) throw fail("Конец периода раньше начала.");
    const specialistIds = (filters.specialistIds ?? []).map(id);
    const types = (filters.types ?? []).map(eventType);
    let query = this.db
      .selectFrom("calendar_event")
      .selectAll()
      .where("business_id", "=", b.id)
      .where("status", "<>", "cancelled")
      .where("starts_at", "<", to)
      .where((eb) =>
        eb.or([eb("ends_at", "is", null), eb("ends_at", ">", from)]),
      );
    if (specialistIds.length)
      query = query.where("specialist_id", "in", specialistIds);
    if (types.length) query = query.where("event_type", "in", types);
    if (filters.onlyMine)
      query = query.where((eb) =>
        eb.or([
          eb("assigned_to", "=", userId),
          eb("created_by", "=", userId),
        ]),
      );
    const events = await query.orderBy("starts_at").execute();
    const items: Array<Record<string, unknown>> = events.map((event) => ({
      kind: "event" as const,
      ...event,
    }));
    if (filters.includeBookings) {
      let bookings = this.db
        .selectFrom("booking as k")
        .innerJoin("booking_service as s", "s.id", "k.service_id")
        .innerJoin("booking_specialist as r", "r.id", "k.specialist_id")
        .innerJoin("client as c", "c.id", "k.client_id")
        .select([
          "k.id",
          "k.starts_at",
          "k.ends_at",
          "k.status",
          "k.specialist_id",
          "k.service_id",
          "k.client_id",
          "s.name as service_name",
          "r.name as specialist_name",
          "c.name as client_name",
        ])
        .where("k.business_id", "=", b.id)
        .where("k.status", "in", ["pending", "confirmed"])
        .where("k.starts_at", "<", to)
        .where("k.ends_at", ">", from);
      if (specialistIds.length)
        bookings = bookings.where("k.specialist_id", "in", specialistIds);
      const rows = await bookings.orderBy("k.starts_at").execute();
      for (const row of rows) {
        items.push({
          kind: "booking",
          id: row.id,
          title: row.service_name + " · " + row.client_name,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          status: row.status,
          specialist_id: row.specialist_id,
          service_id: row.service_id,
          client_id: row.client_id,
          specialist_name: row.specialist_name,
          client_name: row.client_name,
          service_name: row.service_name,
        });
      }
      items.sort((a, b) => +new Date(String(a.starts_at)) - +new Date(String(b.starts_at)));
    }
    return items;
  }

  async get(userId: string, publicId: string, eventId: string) {
    const b = await requireBusiness(this.db, userId, publicId, "booking.write");
    const event = await this.db
      .selectFrom("calendar_event")
      .selectAll()
      .where("business_id", "=", b.id)
      .where("id", "=", id(eventId))
      .executeTakeFirst();
    if (!event)
      throw new AppError(404, "CALENDAR_EVENT_NOT_FOUND", "Событие не найдено.");
    return event;
  }

  async create(
    userId: string,
    publicId: string,
    body: Record<string, unknown>,
  ) {
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "booking.write");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, publicId, "booking.write");
      const type = eventType(body.event_type ?? "note");
      const specialistId = optionalId(body.specialist_id);
      if (type === "blocked_time" && !specialistId) {
        if (!allowed(b.role, "settings.manage"))
          throw new AppError(
            403,
            "FORBIDDEN",
            "Блокировка без специалиста доступна только администратору.",
          );
      }
      const startsAt = when(body.starts_at, "время начала");
      const endsAt =
        body.ends_at == null || body.ends_at === ""
          ? null
          : when(body.ends_at, "время окончания");
      if (type === "blocked_time") {
        if (!endsAt || +endsAt <= +startsAt)
          throw fail("Для блокировки укажите окончание позже начала.");
      } else if (endsAt && +endsAt < +startsAt) {
        throw fail("Окончание раньше начала.");
      }
      const allDay = body.all_day === true;
      if (specialistId) {
        const specialist = await tx
          .selectFrom("booking_specialist")
          .select("id")
          .where("business_id", "=", b.id)
          .where("id", "=", specialistId)
          .executeTakeFirst();
        if (!specialist)
          throw new AppError(404, "NOT_FOUND", "Специалист не найден.");
      }
      const assignedTo = await assertActiveMember(
        tx,
        b.id,
        optionalId(body.assigned_to),
      );
      const related = {
        related_client_id: optionalId(body.related_client_id),
        related_lead_id: optionalId(body.related_lead_id),
        related_order_id: optionalId(body.related_order_id),
        related_booking_id: optionalId(body.related_booking_id),
      };
      if (type === "blocked_time" && endsAt) {
        await assertBlockedTimeClearOfBookings(
          tx,
          b.id,
          specialistId,
          startsAt,
          endsAt,
        );
      }
      const eventId = randomUUID();
      const event = await tx
        .insertInto("calendar_event")
        .values({
          id: eventId,
          business_id: b.id,
          title: title(body.title),
          description: description(body.description),
          starts_at: startsAt,
          ends_at: endsAt,
          all_day: allDay,
          created_by: userId,
          assigned_to: assignedTo,
          specialist_id: specialistId,
          event_type: type,
          status: "open",
          ...related,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      if (body.reminder_offsets != null) {
        await scheduleReminders(tx, {
          businessId: b.id,
          entityKind: "calendar_event",
          entityId: event.id,
          startsAt,
          offsets: parseOffsets(body.reminder_offsets),
          recipientUserId: assignedTo ?? userId,
          messageTemplate:
            typeof body.reminder_template === "string"
              ? body.reminder_template
              : "",
        });
      }
      await audit(tx, b.id, userId, "calendar_event_created", event.id, {
        event_type: type,
      });
      return event;
    });
  }

  async update(
    userId: string,
    publicId: string,
    eventId: string,
    body: Record<string, unknown>,
  ) {
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "booking.write");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, publicId, "booking.write");
      const current = await tx
        .selectFrom("calendar_event")
        .selectAll()
        .where("business_id", "=", b.id)
        .where("id", "=", id(eventId))
        .forUpdate()
        .executeTakeFirst();
      if (!current || current.status === "cancelled")
        throw new AppError(
          404,
          "CALENDAR_EVENT_NOT_FOUND",
          "Событие не найдено.",
        );
      const type =
        body.event_type != null ? eventType(body.event_type) : current.event_type;
      const specialistId =
        body.specialist_id !== undefined
          ? optionalId(body.specialist_id)
          : current.specialist_id;
      if (type === "blocked_time" && !specialistId) {
        if (!allowed(b.role, "settings.manage"))
          throw new AppError(
            403,
            "FORBIDDEN",
            "Блокировка без специалиста доступна только администратору.",
          );
      }
      const startsAt =
        body.starts_at != null
          ? when(body.starts_at, "время начала")
          : current.starts_at;
      const endsAt =
        body.ends_at !== undefined
          ? body.ends_at == null || body.ends_at === ""
            ? null
            : when(body.ends_at, "время окончания")
          : current.ends_at;
      if (type === "blocked_time") {
        if (!endsAt || +endsAt <= +startsAt)
          throw fail("Для блокировки укажите окончание позже начала.");
        await assertBlockedTimeClearOfBookings(
          tx,
          b.id,
          specialistId,
          startsAt,
          endsAt,
        );
      } else if (endsAt && +endsAt < +startsAt) {
        throw fail("Окончание раньше начала.");
      }
      if (specialistId) {
        const specialist = await tx
          .selectFrom("booking_specialist")
          .select("id")
          .where("business_id", "=", b.id)
          .where("id", "=", specialistId)
          .executeTakeFirst();
        if (!specialist)
          throw new AppError(404, "NOT_FOUND", "Специалист не найден.");
      }
      const assignedTo = await assertActiveMember(
        tx,
        b.id,
        body.assigned_to !== undefined
          ? optionalId(body.assigned_to)
          : current.assigned_to,
      );
      const status =
        body.status === "done" || body.status === "open"
          ? body.status
          : current.status;
      const event = await tx
        .updateTable("calendar_event")
        .set({
          title: body.title != null ? title(body.title) : current.title,
          description:
            body.description !== undefined
              ? description(body.description)
              : current.description,
          starts_at: startsAt,
          ends_at: endsAt,
          all_day:
            body.all_day === undefined ? current.all_day : body.all_day === true,
          assigned_to: assignedTo,
          specialist_id: specialistId,
          event_type: type,
          status,
          related_client_id:
            body.related_client_id !== undefined
              ? optionalId(body.related_client_id)
              : current.related_client_id,
          related_lead_id:
            body.related_lead_id !== undefined
              ? optionalId(body.related_lead_id)
              : current.related_lead_id,
          related_order_id:
            body.related_order_id !== undefined
              ? optionalId(body.related_order_id)
              : current.related_order_id,
          related_booking_id:
            body.related_booking_id !== undefined
              ? optionalId(body.related_booking_id)
              : current.related_booking_id,
          updated_at: new Date(),
        })
        .where("id", "=", current.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      if (body.reminder_offsets != null) {
        await scheduleReminders(tx, {
          businessId: b.id,
          entityKind: "calendar_event",
          entityId: event.id,
          startsAt,
          offsets: parseOffsets(body.reminder_offsets),
          recipientUserId: assignedTo ?? userId,
          messageTemplate:
            typeof body.reminder_template === "string"
              ? body.reminder_template
              : "",
        });
      } else if (+startsAt !== +current.starts_at) {
        const existing = await tx
          .selectFrom("entity_reminder")
          .select(["offset_minutes", "audience", "channel", "recipient_user_id", "message_template"])
          .where("business_id", "=", b.id)
          .where("entity_kind", "=", "calendar_event")
          .where("entity_id", "=", event.id)
          .where("status", "in", ["pending", "queued"])
          .execute();
        if (existing.length) {
          await scheduleReminders(tx, {
            businessId: b.id,
            entityKind: "calendar_event",
            entityId: event.id,
            startsAt,
            offsets: existing.map((r) => r.offset_minutes),
            audience: existing[0]!.audience,
            channel: existing[0]!.channel,
            recipientUserId: existing[0]!.recipient_user_id,
            messageTemplate: existing[0]!.message_template,
          });
        }
      }
      await audit(tx, b.id, userId, "calendar_event_updated", event.id, {
        event_type: type,
      });
      return event;
    });
  }

  async cancel(userId: string, publicId: string, eventId: string) {
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "booking.write");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, publicId, "booking.write");
      const current = await tx
        .selectFrom("calendar_event")
        .selectAll()
        .where("business_id", "=", b.id)
        .where("id", "=", id(eventId))
        .forUpdate()
        .executeTakeFirst();
      if (!current)
        throw new AppError(
          404,
          "CALENDAR_EVENT_NOT_FOUND",
          "Событие не найдено.",
        );
      if (current.status === "cancelled") return current;
      const event = await tx
        .updateTable("calendar_event")
        .set({ status: "cancelled", updated_at: new Date() })
        .where("id", "=", current.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await cancelReminders(tx, b.id, "calendar_event", event.id);
      await audit(tx, b.id, userId, "calendar_event_cancelled", event.id, {
        event_type: event.event_type,
      });
      return event;
    });
  }

  async scheduleEntityReminders(
    userId: string,
    publicId: string,
    body: Record<string, unknown>,
  ) {
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "booking.write");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      const entityKind = String(body.entity_kind ?? "");
      if (
        !["calendar_event", "booking", "order", "lead"].includes(entityKind)
      )
        throw fail("Проверьте тип сущности.");
      const entityId = id(body.entity_id);
      const startsAt = when(body.starts_at, "время события");
      const recipientUserId = await assertActiveMember(
        tx,
        b.id,
        optionalId(body.recipient_user_id),
      );
      await scheduleReminders(tx, {
        businessId: b.id,
        entityKind: entityKind as
          | "calendar_event"
          | "booking"
          | "order"
          | "lead",
        entityId,
        startsAt,
        offsets: parseOffsets(body.offsets),
        audience:
          body.audience === "client" || body.audience === "staff"
            ? body.audience
            : "staff",
        channel:
          body.channel === "telegram" ||
          body.channel === "vk" ||
          body.channel === "in_app"
            ? body.channel
            : "in_app",
        recipientUserId,
        messageTemplate:
          typeof body.message_template === "string"
            ? body.message_template
            : "",
      });
      return { ok: true };
    });
  }
}
