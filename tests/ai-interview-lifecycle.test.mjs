import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import {
  AiInterviewService,
  extractJsonPayload,
  normalizeSummary,
} from "../src/server/ai/interview.ts";

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
      name: "Тестовый бизнес",
      timezone: "Europe/Moscow",
      business_type: "service",
      public_name: "Тестовый бизнес",
      greeting: "Привет",
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

test("extractJsonPayload strips markdown fences", () => {
  const raw = 'Here you go:\n```json\n{"name":"A","about":"B","tone":"t","strengths":"s","faq":"f","restrictions":"r"}\n```';
  const json = extractJsonPayload(raw);
  const parsed = JSON.parse(json);
  assert.equal(parsed.name, "A");
});

test("normalizeSummary coerces null/undefined AI fields", () => {
  const summary = normalizeSummary(
    { name: null, about: undefined, tone: 12, strengths: { x: 1 }, faq: "", restrictions: null },
    [{ id: "name", question: "q", answer: "Из ответов" }],
  );
  assert.equal(summary.name, "Из ответов");
  assert.equal(summary.tone, "12");
  assert.equal(summary.strengths, "");
  assert.equal(summary.restrictions, "");
});

test("AI interview happy path: answers → summary → confirm → persisted", async () => {
  const { uid, b } = await ownerBusiness({ industry: "retail" });
  const transport = async () =>
    new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  name: "Цветы",
                  about: "Магазин цветов",
                  tone: "тёплый",
                  strengths: "свежие букеты",
                  faq: "Доставка?",
                  restrictions: "Не обещать скидки",
                }),
              },
            ],
          },
        ],
      }),
      { status: 200 },
    );
  // Patch completeAiDraft via service options — AiInterviewService uses this.options
  const ai = new AiInterviewService(db, {
    token: "test-token",
    model: "test-model",
    transport,
  });
  // completeAiDraft reads options.transport — need to pass through.
  // Interview service only forwards this.options to completeAiDraft.
  Object.assign(ai, {
    options: { token: "test-token", model: "test-model", transport },
  });

  let cur = await ai.get(uid, b.public_id);
  let guard = 0;
  while (cur.currentQuestion && guard++ < 40) {
    await ai.answer(uid, b.public_id, {
      questionId: cur.currentQuestion.id,
      answer: "Ответ " + cur.currentQuestion.id,
    });
    cur = await ai.get(uid, b.public_id);
  }
  assert.ok(cur.state.summary);
  assert.equal(cur.state.summary.name, "Цветы");
  assert.equal(cur.state.aiFallback, false);

  const confirmed = await ai.confirm(uid, b.public_id, true);
  assert.equal(confirmed.applied, true);
  assert.equal(confirmed.state.confirmed, true);

  const again = await ai.confirm(uid, b.public_id, true);
  assert.equal(again.alreadyConfirmed, true);

  const row = await db
    .selectFrom("business")
    .select(["ai_about", "ai_tone", "ai_summary_confirmed_at", "ai_interview"])
    .where("id", "=", b.id)
    .executeTakeFirstOrThrow();
  assert.ok(row.ai_summary_confirmed_at);
  assert.equal(row.ai_about, "Магазин цветов");
  assert.equal(row.ai_tone, "тёплый");
  const state = typeof row.ai_interview === "string"
    ? JSON.parse(row.ai_interview)
    : row.ai_interview;
  assert.equal(state.confirmed, true);
  assert.ok(state.answers.length > 0);
});

test("AI unavailable → fallback summary, answers retained, regenerate works", async () => {
  const { uid, b } = await ownerBusiness({ industry: "beauty" });
  const failTransport = async () => {
    throw new Error("network");
  };
  const ai = new AiInterviewService(db, {
    token: "t",
    model: "m",
    transport: failTransport,
  });

  let cur = await ai.get(uid, b.public_id);
  const answers = [];
  let guard = 0;
  while (cur.currentQuestion && guard++ < 40) {
    const qid = cur.currentQuestion.id;
    const text = "Сохранённый ответ " + qid;
    answers.push({ id: qid, answer: text });
    await ai.answer(uid, b.public_id, { questionId: qid, answer: text });
    cur = await ai.get(uid, b.public_id);
  }

  assert.ok(cur.state.summary);
  assert.equal(cur.state.aiFallback, true);
  assert.ok(cur.state.lastAiError);
  assert.equal(cur.state.answers.length, answers.length);

  // Retry with working AI
  const okTransport = async () =>
    new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text:
                  "```json\n" +
                  JSON.stringify({
                    name: "Салон",
                    about: "Красота",
                    tone: "спокойный",
                    strengths: "мастера",
                    faq: "цена?",
                    restrictions: "нет гарантий",
                  }) +
                  "\n```",
              },
            ],
          },
        ],
      }),
      { status: 200 },
    );
  const ai2 = new AiInterviewService(db, {
    token: "t",
    model: "m",
    transport: okTransport,
  });
  const regen = await ai2.regenerateSummary(uid, b.public_id);
  assert.equal(regen.state.aiFallback, false);
  assert.equal(regen.state.summary.name, "Салон");
  assert.equal(regen.state.answers.length, answers.length);
});

test("AI malformed null fields do not crash confirm apply", async () => {
  const { uid, b } = await ownerBusiness();
  const badTransport = async () =>
    new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  name: null,
                  about: null,
                  tone: null,
                  strengths: null,
                  faq: null,
                  restrictions: null,
                }),
              },
            ],
          },
        ],
      }),
      { status: 200 },
    );
  const ai = new AiInterviewService(db, {
    token: "t",
    model: "m",
    transport: badTransport,
  });
  let cur = await ai.get(uid, b.public_id);
  let guard = 0;
  while (cur.currentQuestion && guard++ < 40) {
    await ai.answer(uid, b.public_id, {
      questionId: cur.currentQuestion.id,
      answer: "A for " + cur.currentQuestion.id,
    });
    cur = await ai.get(uid, b.public_id);
  }
  assert.ok(cur.state.summary);
  // Must not throw TypeError on .slice of null
  const confirmed = await ai.confirm(uid, b.public_id, true);
  assert.equal(confirmed.state.confirmed, true);
  assert.equal(typeof confirmed.state.summary.about, "string");
});

test("duplicate confirm is idempotent", async () => {
  const { uid, b } = await ownerBusiness({ industry: "retail" });
  const ai = new AiInterviewService(db); // no AI token → fallback
  let cur = await ai.get(uid, b.public_id);
  let guard = 0;
  while (cur.currentQuestion && guard++ < 40) {
    await ai.answer(uid, b.public_id, {
      questionId: cur.currentQuestion.id,
      answer: "x",
    });
    cur = await ai.get(uid, b.public_id);
  }
  await ai.confirm(uid, b.public_id, true);
  const second = await ai.confirm(uid, b.public_id, true);
  assert.equal(second.alreadyConfirmed, true);
  assert.equal(second.applied, false);
});

test("regenerate before answers complete is rejected", async () => {
  const { uid, b } = await ownerBusiness();
  const ai = new AiInterviewService(db);
  await assert.rejects(
    () => ai.regenerateSummary(uid, b.public_id),
    (err) =>
      err instanceof Error &&
      "code" in err &&
      err.code === "INVALID_INTERVIEW",
  );
});
