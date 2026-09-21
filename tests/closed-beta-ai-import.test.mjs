import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import {
  assertAiUsageAllowed,
  recordAiUsage,
  aiDailyRequestLimit,
} from "../src/server/ai/usage.ts";
import {
  previewClientRows,
  previewProductRows,
} from "../src/server/import/entity-import.ts";
import { trackProductEvent } from "../src/server/analytics/product-events.ts";

const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

async function business() {
  return db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "AI Biz",
      timezone: "Europe/Moscow",
      business_type: "hybrid",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

test("ai_usage_event migration and daily limit", async () => {
  const b = await business();
  await assertAiUsageAllowed(db, b.id);
  assert.ok(aiDailyRequestLimit() > 0);
  for (let i = 0; i < 3; i++) {
    await recordAiUsage(db, {
      businessId: b.id,
      feature: "posts.draft",
      model: "test",
    });
  }
  const rows = await db
    .selectFrom("ai_usage_event")
    .selectAll()
    .where("business_id", "=", b.id)
    .execute();
  assert.equal(rows.length, 3);
});

test("import preview rejects broken product rows and flags duplicates", () => {
  const preview = previewProductRows([
    { name: "Чай", price: "100", currency: "RUB", sku: "T1" },
    { name: "Чай 2", price: "bad", currency: "RUB", sku: "T2" },
    { name: "Чай 3", price: "50", currency: "RUB", sku: "T1" },
  ]);
  assert.equal(preview[0].status, "ok");
  assert.equal(preview[1].status, "error");
  assert.equal(preview[2].status, "duplicate");
});

test("import preview validates client phones", () => {
  const preview = previewClientRows([
    { name: "Иван", phone: "+79991234567" },
    { name: "", phone: "+79991234567" },
    { name: "Пётр", phone: "123" },
  ]);
  assert.equal(preview[0].status, "ok");
  assert.equal(preview[1].status, "error");
  assert.equal(preview[2].status, "error");
});

test("product_event stores privacy-safe meta only", async () => {
  await trackProductEvent(db, {
    event: "registration_completed",
    userId: randomUUID(),
    meta: {
      source: "web",
      password: "secret",
      phone: "+7999",
      ok: true,
    },
  });
  const row = await db
    .selectFrom("product_event")
    .selectAll()
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  assert.ok(row);
  const meta =
    typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
  assert.equal(meta.source, "web");
  assert.equal(meta.ok, true);
  assert.equal(meta.password, undefined);
  assert.equal(meta.phone, undefined);
});

test("assertAiUsageAllowed throws AppError when over limit", async () => {
  const previous = process.env.AI_DAILY_REQUEST_LIMIT;
  process.env.AI_DAILY_REQUEST_LIMIT = "1";
  try {
    const b = await business();
    await recordAiUsage(db, { businessId: b.id, feature: "posts.draft" });
    await assert.rejects(
      () => assertAiUsageAllowed(db, b.id),
      (e) =>
        !!e &&
        typeof e === "object" &&
        "code" in e &&
        e.code === "AI_LIMIT" &&
        "status" in e &&
        e.status === 429,
    );
  } finally {
    if (previous == null) delete process.env.AI_DAILY_REQUEST_LIMIT;
    else process.env.AI_DAILY_REQUEST_LIMIT = previous;
  }
});
