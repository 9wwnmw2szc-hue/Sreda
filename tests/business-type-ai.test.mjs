import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import {
  parseBusiness,
  parseBusinessType,
} from "../src/server/workspaces/validation.ts";
import { BusinessProfileService } from "../src/server/workspaces/profile.ts";

const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

async function fixture() {
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
      name: "Студия",
      timezone: "Europe/Kaliningrad",
      business_type: "hybrid",
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
  return { uid, b, profile: new BusinessProfileService(db) };
}

test("parseBusiness accepts and validates business_type", () => {
  assert.equal(parseBusinessType(undefined), "hybrid");
  assert.equal(parseBusinessType(""), "hybrid");
  assert.equal(parseBusinessType("store"), "store");
  assert.equal(parseBusinessType("service"), "service");
  assert.deepEqual(
    parseBusiness({
      name: "Магазин",
      timezone: "Europe/Moscow",
      business_type: "store",
    }),
    { name: "Магазин", timezone: "Europe/Moscow", business_type: "store" },
  );
  assert.throws(() => parseBusinessType("factory"), (e) => {
    assert.equal(e.code, "INVALID_BUSINESS_TYPE");
    return true;
  });
});

test("profile AI fields save and get with business_type", async () => {
  const f = await fixture();
  const saved = await f.profile.save(f.uid, f.b.public_id, {
    name: "Ателье",
    timezone: "Europe/Moscow",
    business_type: "service",
    public_name: "Ателье на Неве",
    greeting: "Здравствуйте",
    description: "Шьём на заказ",
    contact_info: "+79990001122",
    ai_about: "Индивидуальный пошив",
    ai_tone: "спокойный и точный",
    ai_important_facts: "Срок от 7 дней",
    ai_restrictions: "Не обещать скидки",
    ai_delivery_info: "Самовывоз",
    ai_geography: "Санкт-Петербург",
    ai_returns_info: "Обмен по согласованию",
    ai_extra_instructions: "Уточнять ткань",
  });
  assert.equal(saved.business_type, "service");
  assert.equal(saved.ai_about, "Индивидуальный пошив");
  assert.equal(saved.ai_tone, "спокойный и точный");
  assert.equal(saved.ai_delivery_info, "Самовывоз");
  const loaded = await f.profile.get(f.uid, f.b.public_id);
  assert.equal(loaded.name, "Ателье");
  assert.equal(loaded.business_type, "service");
  assert.equal(loaded.ai_about, "Индивидуальный пошив");
  assert.equal(loaded.ai_important_facts, "Срок от 7 дней");
  assert.equal(loaded.ai_restrictions, "Не обещать скидки");
  assert.equal(loaded.ai_geography, "Санкт-Петербург");
  assert.equal(loaded.ai_returns_info, "Обмен по согласованию");
  assert.equal(loaded.ai_extra_instructions, "Уточнять ткань");
});
