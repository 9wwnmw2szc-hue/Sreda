import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { CalendarService } from "../src/server/calendar/service.ts";
import {
  assertNoBlockedTimeOverlap,
} from "../src/server/calendar/service.ts";
import { BookingService } from "../src/server/booking/service.ts";
import {
  notify,
  NotificationService,
} from "../src/server/notifications/service.ts";

const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

async function user(role = "owner", businessId) {
  const uid = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: uid,
      name: role === "operator" ? "Operator" : "Admin",
      email: uid + "@test.invalid",
      emailVerified: false,
      username: "u" + uid,
    })
    .execute();
  if (businessId) {
    await db
      .insertInto("business_member")
      .values({
        business_id: businessId,
        user_id: uid,
        role,
        status: "active",
      })
      .execute();
  }
  return uid;
}

async function fixture(withBooking = false) {
  const uid = await user("owner");
  const b = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "Calendar business",
      timezone: "Europe/Kaliningrad",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto("business_member")
    .values({
      business_id: b.id,
      user_id: uid,
      role: "owner",
      status: "active",
    })
    .execute();
  const cal = new CalendarService(db);
  const result = { uid, b, cal, specialist: null, service: null, slots: null };
  if (withBooking) {
    await db
      .insertInto("business_solution")
      .values({
        business_id: b.id,
        solution_code: "booking",
        status: "active",
        starts_at: new Date(),
        expires_at: null,
      })
      .execute();
    const svc = new BookingService(db);
    const service = await svc.configure(uid, b.public_id, {
      kind: "service",
      name: "Консультация",
      duration_minutes: 60,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
    });
    const resource = await svc.configure(uid, b.public_id, {
      kind: "specialist",
      name: "Александр",
    });
    await svc.configure(uid, b.public_id, {
      kind: "links",
      specialist_id: resource.id,
      service_ids: [service.id],
    });
    for (let weekday = 0; weekday < 7; weekday++)
      await svc.configure(uid, b.public_id, {
        kind: "schedule",
        specialist_id: resource.id,
        weekday,
        intervals: [{ start: 540, end: 1080 }],
      });
    const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const slots = await svc.slots(uid, b.public_id, service.id, resource.id, date);
    result.svc = svc;
    result.service = service;
    result.specialist = resource;
    result.slots = slots;
    result.date = date;
  }
  return result;
}

function futureWindow(hoursFromNow = 48, durationHours = 1) {
  const starts = new Date(Date.now() + hoursFromNow * 3600000);
  const ends = new Date(+starts + durationHours * 3600000);
  return { starts_at: starts.toISOString(), ends_at: ends.toISOString() };
}

test("create, update and cancel calendar event", async () => {
  const f = await fixture();
  const window = futureWindow();
  const created = await f.cal.create(f.uid, f.b.public_id, {
    title: "Встреча с клиентом",
    event_type: "meeting",
    ...window,
  });
  assert.equal(created.title, "Встреча с клиентом");
  assert.equal(created.event_type, "meeting");
  assert.equal(created.status, "open");

  const updated = await f.cal.update(f.uid, f.b.public_id, created.id, {
    title: "Обновлённая встреча",
    status: "done",
  });
  assert.equal(updated.title, "Обновлённая встреча");
  assert.equal(updated.status, "done");

  const cancelled = await f.cal.cancel(f.uid, f.b.public_id, created.id);
  assert.equal(cancelled.status, "cancelled");
  const listed = await f.cal.listRange(
    f.uid,
    f.b.public_id,
    window.starts_at,
    window.ends_at,
  );
  assert.equal(listed.some((i) => i.id === created.id), false);
});

test("calendar events are tenant-isolated", async () => {
  const a = await fixture();
  const b = await fixture();
  const window = futureWindow(50);
  const event = await a.cal.create(a.uid, a.b.public_id, {
    title: "Секрет",
    event_type: "note",
    ...window,
  });
  await assert.rejects(
    b.cal.get(b.uid, a.b.public_id, event.id),
    (e) => e.code === "BUSINESS_NOT_FOUND",
  );
  await assert.rejects(
    b.cal.get(b.uid, b.b.public_id, event.id),
    (e) => e.code === "CALENDAR_EVENT_NOT_FOUND",
  );
  const listed = await b.cal.listRange(
    b.uid,
    b.b.public_id,
    window.starts_at,
    window.ends_at,
  );
  assert.equal(listed.length, 0);
});

test("all_day events persist flag", async () => {
  const f = await fixture();
  const day = new Date(Date.now() + 10 * 86400000);
  day.setUTCHours(0, 0, 0, 0);
  const end = new Date(+day + 86400000);
  const event = await f.cal.create(f.uid, f.b.public_id, {
    title: "Выходной",
    event_type: "other",
    starts_at: day.toISOString(),
    ends_at: end.toISOString(),
    all_day: true,
  });
  assert.equal(event.all_day, true);
  const got = await f.cal.get(f.uid, f.b.public_id, event.id);
  assert.equal(got.all_day, true);
});

test("schedule multiple reminders with idempotent duplicate schedule", async () => {
  const f = await fixture();
  const window = futureWindow(72, 2);
  const event = await f.cal.create(f.uid, f.b.public_id, {
    title: "С напоминаниями",
    event_type: "task",
    ...window,
    reminder_offsets: [60, 15, 0],
  });
  const first = await db
    .selectFrom("entity_reminder")
    .selectAll()
    .where("entity_id", "=", event.id)
    .where("status", "=", "pending")
    .execute();
  assert.ok(first.length >= 1);
  assert.ok(first.length <= 3);

  await f.cal.scheduleEntityReminders(f.uid, f.b.public_id, {
    entity_kind: "calendar_event",
    entity_id: event.id,
    starts_at: window.starts_at,
    offsets: [60, 15, 0],
  });
  await f.cal.scheduleEntityReminders(f.uid, f.b.public_id, {
    entity_kind: "calendar_event",
    entity_id: event.id,
    starts_at: window.starts_at,
    offsets: [60, 15, 0],
  });
  const again = await db
    .selectFrom("entity_reminder")
    .selectAll()
    .where("entity_id", "=", event.id)
    .where("status", "in", ["pending", "queued"])
    .execute();
  const offsets = again.map((r) => r.offset_minutes).sort((a, b) => a - b);
  assert.deepEqual(offsets, [...new Set(offsets)]);
  assert.ok(offsets.length <= 3);
});

test("blocked_time rejects overlapping booking and booking rejects blocked_time", async () => {
  const f = await fixture(true);
  assert.ok(f.slots?.length);
  const booking = await f.svc.create(f.uid, f.b.public_id, {
    service_id: f.service.id,
    specialist_id: f.specialist.id,
    starts_at: f.slots[0],
    client: { name: "Иван" },
    request_key: randomUUID(),
  });
  await assert.rejects(
    f.cal.create(f.uid, f.b.public_id, {
      title: "Блок",
      event_type: "blocked_time",
      specialist_id: f.specialist.id,
      starts_at: booking.starts_at.toISOString(),
      ends_at: booking.ends_at.toISOString(),
    }),
    (e) => e.code === "CALENDAR_BLOCK_CONFLICT",
  );

  const freeSlot = f.slots.find(
    (s) =>
      +new Date(s) >= +booking.ends_at + 60 * 60000 ||
      +new Date(s) + 60 * 60000 <= +booking.starts_at,
  );
  assert.ok(freeSlot, "need a free slot away from booking");
  const blockStart = new Date(freeSlot);
  const blockEnd = new Date(+blockStart + 60 * 60000);
  await f.cal.create(f.uid, f.b.public_id, {
    title: "Блок свободный",
    event_type: "blocked_time",
    specialist_id: f.specialist.id,
    starts_at: blockStart.toISOString(),
    ends_at: blockEnd.toISOString(),
  });
  await assert.rejects(
    f.svc.create(f.uid, f.b.public_id, {
      service_id: f.service.id,
      specialist_id: f.specialist.id,
      starts_at: freeSlot,
      client: { name: "Пётр" },
      request_key: randomUUID(),
    }),
    (e) => e.code === "BOOKING_SLOT_UNAVAILABLE",
  );

  await db.transaction().execute(async (tx) => {
    await assert.rejects(
      assertNoBlockedTimeOverlap(
        tx,
        f.b.id,
        f.specialist.id,
        blockStart,
        blockEnd,
      ),
      (e) => e.code === "BOOKING_SLOT_UNAVAILABLE",
    );
  });
});

test("operator can create a note event", async () => {
  const f = await fixture();
  const operatorId = await user("operator", f.b.id);
  const window = futureWindow(30);
  const note = await f.cal.create(operatorId, f.b.public_id, {
    title: "Заметка оператора",
    event_type: "note",
    ...window,
  });
  assert.equal(note.event_type, "note");
  assert.equal(note.created_by, operatorId);
});

test("listRange includes bookings when includeBookings", async () => {
  const f = await fixture(true);
  const booking = await f.svc.create(f.uid, f.b.public_id, {
    service_id: f.service.id,
    specialist_id: f.specialist.id,
    starts_at: f.slots[0],
    client: { name: "Анна" },
    request_key: randomUUID(),
  });
  const from = new Date(+booking.starts_at - 3600000).toISOString();
  const to = new Date(+booking.ends_at + 3600000).toISOString();
  await f.cal.create(f.uid, f.b.public_id, {
    title: "Рядом",
    event_type: "note",
    starts_at: from,
    ends_at: to,
  });
  const mixed = await f.cal.listRange(f.uid, f.b.public_id, from, to, {
    includeBookings: true,
  });
  assert.ok(mixed.some((i) => i.kind === "booking" && i.id === booking.id));
  assert.ok(mixed.some((i) => i.kind === "event"));
  const eventsOnly = await f.cal.listRange(f.uid, f.b.public_id, from, to, {
    includeBookings: false,
  });
  assert.equal(eventsOnly.every((i) => i.kind === "event"), true);
});

test("markAllRead clears unread notifications for user", async () => {
  const f = await fixture();
  await db.transaction().execute((tx) =>
    notify(tx, f.b.id, "lead.created", "cal-lead:1", "Заявка", "/leads"),
  );
  await db.transaction().execute((tx) =>
    notify(tx, f.b.id, "order.created", "cal-order:1", "Заказ", "/orders"),
  );
  const ns = new NotificationService(db);
  const items = await ns.list(f.uid, f.b.public_id);
  assert.ok(items.length >= 2);
  assert.ok(items.every((i) => i.read_at == null));
  await ns.markAllRead(f.uid, f.b.public_id);
  const after = await ns.list(f.uid, f.b.public_id);
  assert.ok(after.every((i) => i.read_at != null));
});
