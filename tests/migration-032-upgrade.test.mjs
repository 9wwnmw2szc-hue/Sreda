import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Kysely, PGliteDialect, sql } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";

test("upgrade 001–031 then 032+ applies orders/AI/leads/booking extensions idempotently", async () => {
  const directory = new URL("../migrations", import.meta.url).pathname;
  const temp = await mkdtemp(join(tmpdir(), "sreda-032-"));
  const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
  try {
    const files = (await readdir(directory))
      .filter((n) => /^\d+_[\w-]+\.sql$/.test(n))
      .sort();
    for (const name of files.filter((n) => Number(n.slice(0, 3)) <= 31))
      await copyFile(join(directory, name), join(temp, name));
    await migrate(db, temp);
    const applied31 = await sql`select name from sreda_migration order by name`.execute(db);
    assert.equal(applied31.rows.length, 31);

    for (const name of files.filter((n) => Number(n.slice(0, 3)) >= 32))
      await copyFile(join(directory, name), join(temp, name));
    await migrate(db, temp);
    await migrate(db, temp); // idempotent

    const applied = await sql`select name from sreda_migration order by name`.execute(db);
    assert.ok(applied.rows.some((r) => r.name.startsWith("032_")));
    assert.ok(applied.rows.some((r) => r.name.startsWith("033_")));
    assert.ok(applied.rows.some((r) => r.name.startsWith("036_")));
    assert.ok(applied.rows.some((r) => r.name.startsWith("038_")));
    assert.ok(applied.rows.some((r) => r.name.startsWith("039_")));

    // New columns / tables exist
    await sql`select business_type, ai_about from business limit 0`.execute(db);
    await sql`select id from product limit 0`.execute(db);
    await sql`select id from "order" limit 0`.execute(db);
    await sql`select id from lead_form_field limit 0`.execute(db);
    await sql`select choose_specialist, schedule_mode from booking_settings limit 0`.execute(db);
    await sql`select text_telegram, text_vk from post limit 0`.execute(db);
    await sql`select id, event_type, all_day from calendar_event limit 0`.execute(db);
    await sql`select id, entity_kind, offset_minutes from entity_reminder limit 0`.execute(db);

    // Existing business row still writable with defaults
    const id = randomUUID();
    await db
      .insertInto("business")
      .values({ id, name: "Upgrade biz", timezone: "Europe/Moscow" })
      .execute();
    const row = await db
      .selectFrom("business")
      .select(["business_type", "ai_about"])
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    assert.equal(row.business_type, "hybrid");
    assert.equal(row.ai_about, "");
  } finally {
    await db.destroy();
    await rm(temp, { recursive: true, force: true });
  }
});
