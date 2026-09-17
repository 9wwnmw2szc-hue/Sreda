import { audit } from "../audit/service.ts";
import { createHash, randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { requireBusiness } from "../access/permissions.ts";
import {
  clientActivity,
  clientInput,
  matchClient,
} from "../clients/service.ts";
import { notify } from "../notifications/service.ts";
import {
  calculateSlots,
  dateOnly,
  intervals,
  localDay,
  localInstants,
  localParts,
  mergeIntervals,
} from "./time.ts";
import type { Interval } from "./time.ts";
const fail = (message = "Проверьте параметры записи.") =>
  new AppError(400, "INVALID_BOOKING", message);
function integer(value: unknown, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw fail();
  return value;
}
function name(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 100)
    throw fail("Укажите название до 100 символов.");
  return value.trim();
}
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
async function activeResource(
  tx: Kysely<Database>,
  businessId: string,
  serviceId: string,
  specialistId: string,
) {
  const service = await tx
    .selectFrom("booking_service")
    .selectAll()
    .where("business_id", "=", businessId)
    .where("id", "=", serviceId)
    .where("active", "=", true)
    .executeTakeFirst();
  const specialist = await tx
    .selectFrom("booking_specialist as s")
    .innerJoin("booking_service_specialist as x", "x.specialist_id", "s.id")
    .select("s.id")
    .where("s.business_id", "=", businessId)
    .where("s.id", "=", specialistId)
    .where("s.active", "=", true)
    .where("x.service_id", "=", serviceId)
    .executeTakeFirst();
  if (!service || !specialist)
    throw new AppError(
      404,
      "BOOKING_RESOURCE_NOT_FOUND",
      "Услуга или специалист недоступны.",
    );
  return service;
}
export async function availableSlots(
  tx: Kysely<Database>,
  businessId: string,
  serviceId: string,
  specialistId: string,
  date: string,
  excludeId?: string,
) {
  const service = await activeResource(tx, businessId, serviceId, specialistId);
  dateOnly(date);
  const business = await tx
    .selectFrom("business")
    .select("timezone")
    .where("id", "=", businessId)
    .executeTakeFirstOrThrow();
  const settings = await tx
    .selectFrom("booking_settings")
    .selectAll()
    .where("business_id", "=", businessId)
    .executeTakeFirst();
  let query = tx
    .selectFrom("booking")
    .select(["occupied_from as from", "occupied_until as until", "starts_at"])
    .where("business_id", "=", businessId)
    .where("specialist_id", "=", specialistId)
    .where("status", "in", ["pending", "confirmed"])
    .where("occupied_until", ">", new Date(Date.parse(date) - 86400000))
    .where("occupied_from", "<", new Date(Date.parse(date) + 2 * 86400000));
  if (excludeId) query = query.where("id", "!=", excludeId);
  const busy = await query.execute();
  let slotIntervals: Interval[];
  if (settings?.schedule_mode === "manual") {
    const dayStart =
      localInstants(date, 0, business.timezone)[0] ??
      new Date(date + "T00:00:00Z");
    const nextDay = new Date(Date.parse(date) + 86400000)
      .toISOString()
      .slice(0, 10);
    const dayEnd =
      localInstants(nextDay, 0, business.timezone)[0] ??
      new Date(Date.parse(date) + 86400000);
    const windows = await tx
      .selectFrom("booking_manual_slot")
      .selectAll()
      .where("business_id", "=", businessId)
      .where("active", "=", true)
      .where("starts_at", "<", dayEnd)
      .where("ends_at", ">", dayStart)
      .where((eb) =>
        eb.or([
          eb("specialist_id", "is", null),
          eb("specialist_id", "=", specialistId),
        ]),
      )
      .where((eb) =>
        eb.or([eb("service_id", "is", null), eb("service_id", "=", serviceId)]),
      )
      .execute();
    slotIntervals = [];
    for (const window of windows) {
      const from = window.starts_at > dayStart ? window.starts_at : dayStart;
      const until = window.ends_at < dayEnd ? window.ends_at : dayEnd;
      if (+until <= +from) continue;
      const taken = busy.filter(
        (b) => +b.starts_at >= +window.starts_at && +b.starts_at < +window.ends_at,
      ).length;
      if (taken >= window.capacity) continue;
      const start = localParts(from, business.timezone);
      const end = localParts(new Date(+until - 1), business.timezone);
      if (start.date !== date) continue;
      const endMinutes =
        end.date === date ? end.minutes + 1 : 1440;
      if (endMinutes <= start.minutes) continue;
      slotIntervals.push({ start: start.minutes, end: endMinutes });
    }
    slotIntervals = mergeIntervals(slotIntervals);
  } else {
    const exception = await tx
      .selectFrom("booking_schedule_exception")
      .select("intervals")
      .where("business_id", "=", businessId)
      .where("specialist_id", "=", specialistId)
      .where("date", "=", date)
      .executeTakeFirst();
    const schedule = await tx
      .selectFrom("booking_schedule")
      .select("intervals")
      .where("business_id", "=", businessId)
      .where("specialist_id", "=", specialistId)
      .where("weekday", "=", new Date(date + "T12:00:00Z").getUTCDay())
      .executeTakeFirst();
    slotIntervals = intervals(exception?.intervals ?? schedule?.intervals ?? []);
  }
  return calculateSlots({
    date,
    timezone: business.timezone,
    intervals: slotIntervals,
    duration: service.duration_minutes,
    before: service.buffer_before_minutes,
    after: service.buffer_after_minutes,
    step: settings?.slot_interval ?? 15,
    notice: settings?.minimum_booking_notice ?? 120,
    horizon: settings?.maximum_booking_horizon ?? 60,
    now: new Date(),
    busy: busy.map((b) => ({ from: b.from, until: b.until })),
  });
}
export async function bookingReminders(
  tx: Transaction<Database>,
  businessId: string,
  bookingId: string,
  revision: number,
  start: Date,
  confirmation = true,
) {
  await tx
    .updateTable("booking_reminder")
    .set({ status: "cancelled" })
    .where("booking_id", "=", bookingId)
    .where("status", "in", ["pending", "queued"])
    .execute();
  for (const [kind, offset] of [
    ["confirmation", 0],
    ["24h", 24 * 3600000],
    ["2h", 2 * 3600000],
  ] as const) {
    if (kind === "confirmation" && !confirmation) continue;
    const due =
      kind === "confirmation" ? new Date() : new Date(+start - offset);
    if (kind !== "confirmation" && +due <= Date.now()) continue;
    await tx
      .insertInto("booking_reminder")
      .values({
        id: randomUUID(),
        business_id: businessId,
        booking_id: bookingId,
        revision,
        kind,
        due_at: due,
        last_error: null,
      })
      .onConflict((oc) =>
        oc.columns(["booking_id", "revision", "kind"]).doNothing(),
      )
      .execute();
  }
}
export class BookingService {
  constructor(private db: Kysely<Database>) {}
  async catalog(userId: string, publicId: string) {
    const b = await requireBusiness(this.db, userId, publicId, "clients.read");
    return this.catalogForBusiness(b.id);
  }
  async catalogForBusiness(businessId: string) {
    const [
      services,
      specialists,
      links,
      schedules,
      exceptions,
      settings,
      manualSlots,
    ] = await Promise.all([
      this.db
        .selectFrom("booking_service")
        .selectAll()
        .where("business_id", "=", businessId)
        .orderBy("name")
        .execute(),
      this.db
        .selectFrom("booking_specialist")
        .selectAll()
        .where("business_id", "=", businessId)
        .orderBy("name")
        .execute(),
      this.db
        .selectFrom("booking_service_specialist")
        .selectAll()
        .where("business_id", "=", businessId)
        .execute(),
      this.db
        .selectFrom("booking_schedule")
        .selectAll()
        .where("business_id", "=", businessId)
        .execute(),
      this.db
        .selectFrom("booking_schedule_exception")
        .selectAll()
        .where("business_id", "=", businessId)
        .execute(),
      this.db
        .selectFrom("booking_settings")
        .selectAll()
        .where("business_id", "=", businessId)
        .executeTakeFirst(),
      this.db
        .selectFrom("booking_manual_slot")
        .selectAll()
        .where("business_id", "=", businessId)
        .where("active", "=", true)
        .orderBy("starts_at")
        .execute(),
    ]);
    return {
      services,
      specialists,
      links,
      schedules,
      exceptions,
      manualSlots,
      settings: settings ?? {
        minimum_booking_notice: 120,
        maximum_booking_horizon: 60,
        slot_interval: 15,
        choose_specialist: true,
        schedule_mode: "automatic" as const,
      },
    };
  }
  async configure(
    userId: string,
    publicId: string,
    body: Record<string, unknown>,
  ) {
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "solutions.manage");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, publicId, "solutions.manage");
      const kind = body.kind;
      if (kind === "settings") {
        if (
          body.choose_specialist != null &&
          typeof body.choose_specialist !== "boolean"
        )
          throw fail();
        const choose =
          body.choose_specialist == null ? true : body.choose_specialist;
        const scheduleMode = String(body.schedule_mode ?? "automatic");
        if (!["automatic", "manual"].includes(scheduleMode)) throw fail();
        const values = {
          business_id: b.id,
          minimum_booking_notice: integer(
            body.minimum_booking_notice,
            0,
            10080,
          ),
          maximum_booking_horizon: integer(
            body.maximum_booking_horizon,
            1,
            365,
          ),
          slot_interval: integer(body.slot_interval, 5, 240),
          choose_specialist: choose,
          schedule_mode: scheduleMode as "automatic" | "manual",
        };
        await tx
          .insertInto("booking_settings")
          .values(values)
          .onConflict((oc) => oc.column("business_id").doUpdateSet(values))
          .execute();
        return { ok: true };
      }
      if (kind === "manual_slot" || kind === "manual_slot_delete") {
        if (kind === "manual_slot_delete") {
          const key = id(body.id);
          const changed = await tx
            .updateTable("booking_manual_slot")
            .set({ active: false })
            .where("business_id", "=", b.id)
            .where("id", "=", key)
            .returning("id")
            .executeTakeFirst();
          if (!changed)
            throw new AppError(404, "NOT_FOUND", "Слот не найден.");
          return { ok: true };
        }
        const starts = new Date(String(body.starts_at));
        const ends = new Date(String(body.ends_at));
        if (!Number.isFinite(+starts) || !Number.isFinite(+ends) || +starts >= +ends)
          throw fail("Проверьте окно слота.");
        const specialistId =
          body.specialist_id == null || body.specialist_id === ""
            ? null
            : id(body.specialist_id);
        const serviceId =
          body.service_id == null || body.service_id === ""
            ? null
            : id(body.service_id);
        if (specialistId) {
          const row = await tx
            .selectFrom("booking_specialist")
            .select("id")
            .where("business_id", "=", b.id)
            .where("id", "=", specialistId)
            .executeTakeFirst();
          if (!row) throw new AppError(404, "NOT_FOUND", "Специалист не найден.");
        }
        if (serviceId) {
          const row = await tx
            .selectFrom("booking_service")
            .select("id")
            .where("business_id", "=", b.id)
            .where("id", "=", serviceId)
            .executeTakeFirst();
          if (!row) throw new AppError(404, "NOT_FOUND", "Услуга не найдена.");
        }
        const capacity = integer(body.capacity ?? 1, 1, 100);
        const key = body.id ? id(body.id) : randomUUID();
        const values = {
          id: key,
          business_id: b.id,
          specialist_id: specialistId,
          service_id: serviceId,
          starts_at: starts,
          ends_at: ends,
          capacity,
          active: body.active !== false,
        };
        if (body.id) {
          const changed = await tx
            .updateTable("booking_manual_slot")
            .set(values)
            .where("business_id", "=", b.id)
            .where("id", "=", key)
            .returning("id")
            .executeTakeFirst();
          if (!changed)
            throw new AppError(404, "NOT_FOUND", "Слот не найден.");
        } else
          await tx.insertInto("booking_manual_slot").values(values).execute();
        return { id: key };
      }
      if (kind === "service" || kind === "specialist") {
        const key = body.id ? id(body.id) : randomUUID();
        const active = body.active ?? true;
        if (typeof active !== "boolean") throw fail();
        const description =
          typeof body.description === "string" ? body.description : "";
        if (description.length > 4000) throw fail();
        const common = {
          id: key,
          business_id: b.id,
          name: name(body.name),
          description,
          active,
          updated_at: new Date(),
        };
        if (kind === "service") {
          const price =
            body.price == null || body.price === "" ? null : String(body.price);
          if (
            price !== null &&
            (!/^\d{1,9}(\.\d{1,2})?$/.test(price) || Number(price) < 0)
          )
            throw fail("Проверьте цену.");
          const currency = String(body.currency ?? "RUB");
          if (!/^[A-Z]{3}$/.test(currency)) throw fail();
          const value = {
            ...common,
            price,
            currency,
            duration_minutes: integer(body.duration_minutes, 5, 1440),
            buffer_before_minutes: integer(
              body.buffer_before_minutes ?? 0,
              0,
              720,
            ),
            buffer_after_minutes: integer(
              body.buffer_after_minutes ?? 0,
              0,
              720,
            ),
          };
          if (body.id) {
            const changed = await tx
              .updateTable("booking_service")
              .set(value)
              .where("business_id", "=", b.id)
              .where("id", "=", key)
              .returning("id")
              .executeTakeFirst();
            if (!changed)
              throw new AppError(404, "NOT_FOUND", "Услуга не найдена.");
          } else await tx.insertInto("booking_service").values(value).execute();
        } else {
          const title =
            body.title == null || body.title === ""
              ? ""
              : typeof body.title === "string" && body.title.length <= 120
                ? body.title.trim()
                : (() => {
                    throw fail("Проверьте должность специалиста.");
                  })();
          const photo =
            body.photo_attachment_id == null || body.photo_attachment_id === ""
              ? null
              : id(body.photo_attachment_id);
          if (photo) {
            const file = await tx
              .selectFrom("attachment")
              .select("id")
              .where("business_id", "=", b.id)
              .where("id", "=", photo)
              .executeTakeFirst();
            if (!file) throw fail("Фото специалиста не найдено.");
          }
          const value = { ...common, title, photo_attachment_id: photo };
          if (body.id) {
            const changed = await tx
              .updateTable("booking_specialist")
              .set(value)
              .where("business_id", "=", b.id)
              .where("id", "=", key)
              .returning("id")
              .executeTakeFirst();
            if (!changed)
              throw new AppError(404, "NOT_FOUND", "Специалист не найден.");
          } else
            await tx.insertInto("booking_specialist").values(value).execute();
        }
        await tx
          .insertInto("business_audit_log")
          .values({
            id: randomUUID(),
            business_id: b.id,
            actor_user_id: userId,
            action:
              kind === "service"
                ? body.id
                  ? "service_updated"
                  : "service_created"
                : body.id
                  ? "specialist_updated"
                  : "specialist_created",
            target_user_id: null,
            details: key,
          })
          .execute();
        return { id: key };
      }
      const specialistId = id(body.specialist_id);
      const specialist = await tx
        .selectFrom("booking_specialist")
        .select("id")
        .where("business_id", "=", b.id)
        .where("id", "=", specialistId)
        .executeTakeFirst();
      if (!specialist)
        throw new AppError(404, "NOT_FOUND", "Специалист не найден.");
      if (kind === "links") {
        if (!Array.isArray(body.service_ids) || body.service_ids.length > 100)
          throw fail();
        const ids = [...new Set(body.service_ids.map(id))];
        if (ids.length) {
          const services = await tx
            .selectFrom("booking_service")
            .select("id")
            .where("business_id", "=", b.id)
            .where("id", "in", ids)
            .execute();
          if (services.length !== ids.length) throw fail();
        }
        await tx
          .deleteFrom("booking_service_specialist")
          .where("business_id", "=", b.id)
          .where("specialist_id", "=", specialistId)
          .execute();
        for (const service_id of ids)
          await tx
            .insertInto("booking_service_specialist")
            .values({
              business_id: b.id,
              specialist_id: specialistId,
              service_id,
            })
            .execute();
        return { ok: true };
      }
      const value = {
        business_id: b.id,
        specialist_id: specialistId,
        intervals: JSON.stringify(intervals(body.intervals)),
      };
      if (kind === "schedule") {
        const weekday = integer(body.weekday, 0, 6);
        await tx
          .insertInto("booking_schedule")
          .values({ ...value, weekday })
          .onConflict((oc) =>
            oc
              .columns(["specialist_id", "weekday"])
              .doUpdateSet({ intervals: value.intervals }),
          )
          .execute();
      } else if (kind === "exception") {
        const date = dateOnly(String(body.date));
        const reason = String(body.reason ?? "").slice(0, 500);
        await tx
          .insertInto("booking_schedule_exception")
          .values({ ...value, date, reason })
          .onConflict((oc) =>
            oc
              .columns(["specialist_id", "date"])
              .doUpdateSet({ intervals: value.intervals, reason }),
          )
          .execute();
      } else throw fail();
      return { ok: true };
    });
  }
  async slots(
    userId: string,
    publicId: string,
    service: string,
    specialist: string,
    date: string,
    exclude?: string,
  ) {
    const b = await requireBusiness(this.db, userId, publicId, "clients.read");
    if (exclude) {
      const booking = await this.db
        .selectFrom("booking")
        .select("id")
        .where("business_id", "=", b.id)
        .where("id", "=", id(exclude))
        .where("service_id", "=", id(service))
        .where("specialist_id", "=", id(specialist))
        .executeTakeFirst();
      if (!booking)
        throw new AppError(404, "BOOKING_NOT_FOUND", "Запись не найдена.");
    }
    return availableSlots(
      this.db,
      b.id,
      id(service),
      id(specialist),
      date,
      exclude,
    );
  }
  async list(
    userId: string,
    publicId: string,
    from?: string,
    until?: string,
    page = 0,
  ) {
    if (!Number.isSafeInteger(page) || page < 0 || page > 100000) throw fail();
    const b = await requireBusiness(this.db, userId, publicId, "clients.read");
    let q = this.db
      .selectFrom("booking as b")
      .innerJoin("client as c", "c.id", "b.client_id")
      .innerJoin("booking_service as s", "s.id", "b.service_id")
      .innerJoin("booking_specialist as r", "r.id", "b.specialist_id")
      .selectAll("b")
      .select([
        "c.name as client_name",
        "c.phone",
        "s.name as service_name",
        "r.name as specialist_name",
      ])
      .where("b.business_id", "=", b.id)
      .orderBy("b.starts_at")
      .orderBy("b.id")
      .limit(500)
      .offset(page * 500);
    if (from) {
      if (!Number.isFinite(Date.parse(from))) throw fail();
      q = q.where("b.starts_at", ">=", new Date(from));
    }
    if (until) {
      if (!Number.isFinite(Date.parse(until))) throw fail();
      q = q.where("b.starts_at", "<", new Date(until));
    }
    return q.execute();
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
      let clientId = body.client_id ? id(body.client_id) : undefined;
      if (!clientId && typeof body.request_key === "string") {
        const previous = await tx
          .selectFrom("booking")
          .select("client_id")
          .where("business_id", "=", b.id)
          .where("request_key", "=", body.request_key)
          .executeTakeFirst();
        clientId = previous?.client_id;
      }
      if (!clientId) {
        if (!body.client || typeof body.client !== "object")
          throw fail("Выберите клиента.");
        clientId = await matchClient(tx, b.id, {
          ...clientInput(body.client as Record<string, unknown>),
          identities: [],
        });
      }
      return this.createInTransaction(
        tx,
        b.id,
        clientId,
        body,
        userId,
        "manual",
      );
    });
  }
  async createInTransaction(
    tx: Transaction<Database>,
    businessId: string,
    clientId: string,
    body: Record<string, unknown>,
    actor: string | null,
    source: "manual" | "telegram" | "vk",
  ) {
    await tx
      .selectFrom("business")
      .select("id")
      .where("id", "=", businessId)
      .forUpdate()
      .execute();
    const serviceId = id(body.service_id),
      specialistId = id(body.specialist_id),
      start = new Date(String(body.starts_at));
    const key = String(body.request_key ?? "");
    if (!/^[a-zA-Z0-9:_-]{8,200}$/.test(key) || !Number.isFinite(+start))
      throw fail();
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          clientId,
          serviceId,
          specialistId,
          start: start.toISOString(),
          client: body.client ?? null,
        }),
      )
      .digest("hex");
    const duplicate = await tx
      .selectFrom("booking")
      .selectAll()
      .where("business_id", "=", businessId)
      .where("request_key", "=", key)
      .executeTakeFirst();
    if (duplicate) {
      if (duplicate.request_hash !== hash)
        throw new AppError(409, "REQUEST_CONFLICT", "Запрос уже использован.");
      return duplicate;
    }
    const client = await tx
      .selectFrom("client")
      .select(["id", "name", "phone"])
      .where("business_id", "=", businessId)
      .where("id", "=", clientId)
      .executeTakeFirst();
    if (!client)
      throw new AppError(404, "CLIENT_NOT_FOUND", "Клиент не найден.");
    await tx
      .selectFrom("booking_specialist")
      .select("id")
      .where("business_id", "=", businessId)
      .where("id", "=", specialistId)
      .forUpdate()
      .execute();
    const service = await activeResource(
      tx,
      businessId,
      serviceId,
      specialistId,
    );
    const b = await tx
      .selectFrom("business")
      .select("timezone")
      .where("id", "=", businessId)
      .executeTakeFirstOrThrow();
    const slots = await availableSlots(
      tx,
      businessId,
      serviceId,
      specialistId,
      localDay(start, b.timezone),
    );
    if (!slots.includes(start.toISOString()))
      throw new AppError(
        409,
        "BOOKING_SLOT_UNAVAILABLE",
        "Это время уже занято или недоступно.",
      );
    const booking = await tx
      .insertInto("booking")
      .values({
        id: randomUUID(),
        business_id: businessId,
        client_id: clientId,
        service_id: serviceId,
        specialist_id: specialistId,
        starts_at: start,
        ends_at: new Date(+start + service.duration_minutes * 60000),
        occupied_from: new Date(+start - service.buffer_before_minutes * 60000),
        occupied_until: new Date(
          +start +
            (service.duration_minutes + service.buffer_after_minutes) * 60000,
        ),
        status: "confirmed",
        source,
        request_key: key,
        request_hash: hash,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await tx
      .insertInto("booking_history")
      .values({
        id: randomUUID(),
        business_id: businessId,
        booking_id: booking.id,
        action: "created",
        actor_user_id: actor,
        previous_start: null,
        new_start: start,
      })
      .execute();
    await clientActivity(
      tx,
      businessId,
      clientId,
      "booking.created",
      "booking:" + booking.id,
      booking.id,
      actor,
    );
    await notify(
      tx,
      businessId,
      "booking.created",
      "booking:" + booking.id,
      "Новая запись: " +
        client.name +
        "\n" +
        service.name +
        "\n" +
        start.toLocaleString("ru", { timeZone: b.timezone }),
      " /bookings".trim(),
    );
    await bookingReminders(
      tx,
      businessId,
      booking.id,
      1,
      start,
      source === "manual",
    );
    await audit(tx, businessId, actor, "booking_created", booking.id, {
      source,
      client_id: clientId,
    });
    return booking;
  }
  async change(
    userId: string,
    publicId: string,
    bookingId: string,
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
      return this.changeInTransaction(tx, b.id, bookingId, body, userId);
    });
  }
  async changeInTransaction(
    tx: Transaction<Database>,
    businessId: string,
    bookingId: string,
    body: Record<string, unknown>,
    actor: string | null,
    clientId?: string,
  ) {
    const b = await tx
      .selectFrom("business")
      .select("timezone")
      .where("id", "=", businessId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    let q = tx
      .selectFrom("booking")
      .selectAll()
      .where("business_id", "=", businessId)
      .where("id", "=", id(bookingId));
    if (clientId) q = q.where("client_id", "=", clientId);
    const current = await q.forUpdate().executeTakeFirst();
    if (!current)
      throw new AppError(404, "BOOKING_NOT_FOUND", "Запись не найдена.");
    if (body.revision !== current.revision)
      throw new AppError(
        409,
        "BOOKING_CHANGED",
        "Запись уже изменена. Обновите данные.",
      );
    if (!["pending", "confirmed"].includes(current.status))
      throw new AppError(
        409,
        "BOOKING_CLOSED",
        "Запись уже завершена или отменена.",
      );
    const action = body.action;
    if (
      !["reschedule", "cancel", "complete", "no_show"].includes(
        String(action),
      ) ||
      (clientId && !["reschedule", "cancel"].includes(String(action)))
    )
      throw fail();
    const revision = current.revision + 1;
    let newStart: Date | null = null;
    if (action === "reschedule") {
      newStart = new Date(String(body.starts_at));
      if (!Number.isFinite(+newStart)) throw fail();
      await tx
        .selectFrom("booking_specialist")
        .select("id")
        .where("id", "=", current.specialist_id)
        .forUpdate()
        .execute();
      const service = await activeResource(
        tx,
        businessId,
        current.service_id,
        current.specialist_id,
      );
      const slots = await availableSlots(
        tx,
        businessId,
        current.service_id,
        current.specialist_id,
        localDay(newStart, b.timezone),
        current.id,
      );
      if (!slots.includes(newStart.toISOString()))
        throw new AppError(
          409,
          "BOOKING_SLOT_UNAVAILABLE",
          "Это время уже занято или недоступно.",
        );
      await tx
        .updateTable("booking")
        .set({
          starts_at: newStart,
          ends_at: new Date(+newStart + service.duration_minutes * 60000),
          occupied_from: new Date(
            +newStart - service.buffer_before_minutes * 60000,
          ),
          occupied_until: new Date(
            +newStart +
              (service.duration_minutes + service.buffer_after_minutes) * 60000,
          ),
          revision,
          updated_at: new Date(),
        })
        .where("id", "=", current.id)
        .execute();
      await bookingReminders(
        tx,
        businessId,
        current.id,
        revision,
        newStart,
        !clientId,
      );
    } else {
      await tx
        .updateTable("booking")
        .set({
          status:
            action === "cancel"
              ? "cancelled"
              : action === "complete"
                ? "completed"
                : "no_show",
          revision,
          updated_at: new Date(),
        })
        .where("id", "=", current.id)
        .execute();
      await tx
        .updateTable("booking_reminder")
        .set({ status: "cancelled" })
        .where("booking_id", "=", current.id)
        .where("status", "in", ["pending", "queued"])
        .execute();
    }
    const type =
      action === "reschedule"
        ? "booking.rescheduled"
        : action === "cancel"
          ? "booking.cancelled"
          : action === "complete"
            ? "booking.completed"
            : "booking.no_show";
    await tx
      .insertInto("booking_history")
      .values({
        id: randomUUID(),
        business_id: businessId,
        booking_id: current.id,
        action: String(action),
        actor_user_id: actor,
        previous_start: current.starts_at,
        new_start: newStart,
      })
      .execute();
    await clientActivity(
      tx,
      businessId,
      current.client_id,
      type,
      "booking:" + current.id + ":" + revision,
      current.id,
      actor,
    );
    if (type === "booking.cancelled" || type === "booking.rescheduled")
      await notify(
        tx,
        businessId,
        type,
        "booking:" + current.id + ":" + revision,
        type === "booking.cancelled" ? "Запись отменена" : "Запись перенесена",
        "/bookings",
      );
    if (action !== "no_show")
      await audit(
        tx,
        businessId,
        actor,
        action === "reschedule"
          ? "booking_rescheduled"
          : action === "cancel"
            ? "booking_cancelled"
            : "booking_completed",
        current.id,
        {
          previous_start: current.starts_at.toISOString(),
          new_start: newStart?.toISOString(),
          revision,
        },
      );
    return tx
      .selectFrom("booking")
      .selectAll()
      .where("id", "=", current.id)
      .executeTakeFirstOrThrow();
  }
}
