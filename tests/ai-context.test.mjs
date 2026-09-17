import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { buildAiContext } from "../src/server/ai/context.ts";
import { generatePost } from "../src/server/ai/posts.ts";
import {
  parseBusiness,
  parseBusinessType,
} from "../src/server/workspaces/validation.ts";

const db = new Kysely({
  dialect: new PGliteDialect({ pglite: new PGlite() }),
});

before(async () => {
  await migrate(db, new URL("../migrations", import.meta.url).pathname);
});

after(async () => {
  await db.destroy();
});

test("parseBusiness accepts business_type", () => {
  assert.equal(parseBusinessType(undefined), "hybrid");
  assert.equal(parseBusinessType("store"), "store");
  assert.deepEqual(
    parseBusiness({
      name: "Кафе",
      timezone: "Europe/Moscow",
      business_type: "service",
    }),
    { name: "Кафе", timezone: "Europe/Moscow", business_type: "service" },
  );
  assert.throws(() => parseBusinessType("factory"), (e) => {
    assert.equal(e?.code, "INVALID_BUSINESS_TYPE");
    return true;
  });
});

test("buildAiContext loads profile facts and never invents products", async () => {
  const id = randomUUID();
  await db
    .insertInto("business")
    .values({
      id,
      public_id: "biz_" + randomUUID().replaceAll("-", "").slice(0, 20),
      name: "Студия",
      timezone: "Europe/Kaliningrad",
      business_type: "hybrid",
      ai_about: "Шьём на заказ",
      ai_tone: "спокойный",
      ai_restrictions: "Не обещать скидки\nНе называть чужие бренды",
      ai_delivery_info: "Самовывоз",
      ai_geography: "Калининград",
      ai_returns_info: "",
      ai_important_facts: "Работаем с 10:00",
      ai_extra_instructions: "",
      archived_at: null,
    })
    .execute();

  await db
    .insertInto("booking_service")
    .values({
      id: randomUUID(),
      business_id: id,
      name: "Консультация",
      price: "1500.00",
      duration_minutes: 45,
      active: true,
    })
    .execute();

  const ctx = await buildAiContext(db, id);
  assert.equal(ctx.name, "Студия");
  assert.equal(ctx.deliveryInfo, "Самовывоз");
  assert.deepEqual(ctx.restrictions, [
    "Не обещать скидки",
    "Не называть чужие бренды",
  ]);
  assert.equal(ctx.services.length, 1);
  assert.equal(ctx.services[0].name, "Консультация");
  assert.match(ctx.systemPromptFragment, /НИКОГДА не выдумывай/);
  assert.match(ctx.systemPromptFragment, /Самовывоз/);
  assert.match(ctx.systemPromptFragment, /Консультация/);
});

test("generatePost degrades when context fails and stays draft-only", async () => {
  const result = await generatePost(
    { action: "generate", prompt: "Короткий пост о студии" },
    {
      db,
      businessId: randomUUID(),
      token: "test-token",
      model: "test-model",
      transport: async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: "Черновик поста" }],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    },
  );
  assert.deepEqual(result, { text: "Черновик поста", status: "draft" });
});
