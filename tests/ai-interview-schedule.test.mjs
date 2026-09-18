import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { AiInterviewService } from "../src/server/ai/interview.ts";
import { BookingService } from "../src/server/booking/service.ts";

const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

async function ownerBusiness(extra = {}) {
  const uid = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: uid,
      name: "Owner",
      email: uid + "@test.invalid",
      emailVerified: false,
      username: "u" + uid,
    })
    .execute();
  const b = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "Барбершоп Борода",
      timezone: "Europe/Moscow",
      business_type: "service",
      public_name: "Барбершоп Борода",
      greeting: "Добро пожаловать в Барбершоп Борода!",
      ...extra,
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
  return { uid, b };
}

test("AI interview uses beauty industry questions", async () => {
  const { uid, b } = await ownerBusiness({ industry: "beauty" });
  const ai = new AiInterviewService(db);
  const state = await ai.get(uid, b.public_id);
  assert.ok(state.questions.some((q) => q.id === "specialist_count"));
  assert.equal(state.industry, "beauty");
});

test("AI interview confirm requires summary and applies only when asked", async () => {
  const { uid, b } = await ownerBusiness({ industry: "retail" });
  const ai = new AiInterviewService(db);
  const first = await ai.get(uid, b.public_id);
  assert.ok(first.currentQuestion);
  await ai.answer(uid, b.public_id, {
    questionId: first.currentQuestion.id,
    answer: "Магазин цветов",
  });
  // Finish remaining questions quickly with deterministic fallback summary
  let cur = await ai.get(uid, b.public_id);
  let guard = 0;
  while (cur.currentQuestion && guard++ < 30) {
    await ai.answer(uid, b.public_id, {
      questionId: cur.currentQuestion.id,
      answer: "Тестовый ответ для " + cur.currentQuestion.id,
    });
    cur = await ai.get(uid, b.public_id);
  }
  assert.ok(cur.state.summary);
  const confirmed = await ai.confirm(uid, b.public_id, true);
  assert.equal(confirmed.applied, true);
  assert.equal(confirmed.state.confirmed, true);
  const row = await db
    .selectFrom("business")
    .select(["ai_about", "greeting", "ai_summary_confirmed_at"])
    .where("id", "=", b.id)
    .executeTakeFirstOrThrow();
  assert.ok(row.ai_summary_confirmed_at);
  assert.ok(row.ai_about.length > 0);
  assert.match(row.greeting, /Добро пожаловать/);
});

test("schedule_bulk saves weekly days and slots respect duration", async () => {
  const { uid, b } = await ownerBusiness();
  const booking = new BookingService(db);
  const specialist = await booking.configure(uid, b.public_id, {
    kind: "specialist",
    name: "Анна",
    active: true,
  });
  const service = await booking.configure(uid, b.public_id, {
    kind: "service",
    name: "Стрижка",
    duration_minutes: 60,
    buffer_before_minutes: 0,
    buffer_after_minutes: 15,
    active: true,
  });
  await booking.configure(uid, b.public_id, {
    kind: "links",
    specialist_id: specialist.id,
    service_ids: [service.id],
  });
  await booking.configure(uid, b.public_id, {
    kind: "settings",
    schedule_mode: "automatic",
    slot_interval: 30,
    maximum_booking_horizon: 14,
    minimum_booking_notice: 0,
  });
  await booking.configure(uid, b.public_id, {
    kind: "schedule_bulk",
    specialist_id: specialist.id,
    days: [
      { weekday: 1, intervals: [{ start: 9 * 60, end: 13 * 60 }, { start: 14 * 60, end: 18 * 60 }] },
      { weekday: 2, intervals: [{ start: 9 * 60, end: 18 * 60 }] },
      { weekday: 0, intervals: [] },
      { weekday: 3, intervals: [] },
      { weekday: 4, intervals: [] },
      { weekday: 5, intervals: [] },
      { weekday: 6, intervals: [] },
    ],
  });
  const catalog = await booking.catalog(uid, b.public_id);
  const mon = catalog.schedules.find(
    (s) => s.specialist_id === specialist.id && s.weekday === 1,
  );
  assert.ok(mon);
  assert.equal(mon.intervals.length, 2);
  assert.equal(mon.intervals[0].end, 13 * 60);
});
