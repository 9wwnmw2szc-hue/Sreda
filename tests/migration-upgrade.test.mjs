import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Kysely, PGliteDialect, PostgresDialect, sql } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { migrate } from "../src/server/db/migrate.ts";

test("upgrade populated schema 001–018 preserves every existing column and row, then is idempotent", async () => {
  const directory = new URL("../migrations", import.meta.url).pathname;
  const temp = await mkdtemp(tmpdir() + "/sreda-upgrade-");
  const schema = "upgrade_" + randomUUID().replaceAll("-", "");
  let admin;
  let db;
  try {
    if (process.env.TEST_DATABASE_URL) {
      admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      await admin.query(`create schema ${schema}`);
      db = new Kysely({
        dialect: new PostgresDialect({
          pool: new Pool({
            connectionString: process.env.TEST_DATABASE_URL,
            options: `-c search_path=${schema}`,
          }),
        }),
      });
    } else
      db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
    for (const name of await readdir(directory))
      if (Number(name.slice(0, 3)) <= 18)
        await copyFile(directory + "/" + name, temp + "/" + name);
    await migrate(db, temp);
    const uid = randomUUID(),
      business = randomUUID(),
      connection = randomUUID(),
      conversation = randomUUID();
    await db
      .insertInto("user")
      .values({
        id: uid,
        name: "Сотрудник",
        email: uid + "@test.invalid",
        emailVerified: false,
        username: "u" + uid,
      })
      .execute();
    await db
      .insertInto("business")
      .values({
        id: business,
        name: "Существующий бизнес",
        timezone: "Europe/Kaliningrad",
      })
      .execute();
    await db
      .insertInto("business_member")
      .values({
        business_id: business,
        user_id: uid,
        role: "owner",
        status: "active",
      })
      .execute();
    await db
      .insertInto("account")
      .values({
        userId: uid,
        accountId: uid,
        providerId: "credential",
        password: "preserved-hash",
        updatedAt: new Date(),
      })
      .execute();
    await db
      .insertInto("session")
      .values({
        userId: uid,
        token: "fixture-session",
        expiresAt: new Date(Date.now() + 86400000),
        updatedAt: new Date(),
      })
      .execute();
    await db
      .insertInto("business_connection")
      .values({
        id: connection,
        business_id: business,
        platform: "telegram",
        external_account_id: "111",
        display_name: "Legacy bot",
        status: "connected",
      })
      .execute();
    await db
      .insertInto("connection_secret")
      .values({
        connection_id: connection,
        encrypted_token: "existing-encrypted-ciphertext",
        key_version: 1,
      })
      .execute();
    await db
      .insertInto("telegram_runtime")
      .values({
        connection_id: connection,
        generation: randomUUID(),
        status: "ready",
      })
      .execute();
    await db
      .insertInto("telegram_dialog")
      .values({
        connection_id: connection,
        chat_id: "111",
        fields: '["name"]',
        answers: "{}",
        position: 0,
        last_update_id: "1",
      })
      .execute();
    await db
      .insertInto("telegram_update")
      .values({ connection_id: connection, update_id: "1" })
      .execute();
    await db
      .insertInto("telegram_outbox")
      .values([
        {
          connection_id: connection,
          chat_id: "111",
          message: "Pending legacy",
          delivered_at: null,
        },
        {
          connection_id: connection,
          chat_id: "112",
          message: "Sent legacy",
          delivered_at: new Date(),
        },
      ])
      .execute();
    await db
      .insertInto("lead")
      .values(
        ["", " ", "Имя".repeat(60), "Анна"].map((name) => ({
          id: randomUUID(),
          business_id: business,
          source: "telegram",
          name,
          phone: "+79991234567",
          message: "Не изменять",
          status: "processing",
        })),
      )
      .execute();
    await db
      .insertInto("communication_conversation")
      .values({
        id: conversation,
        business_id: business,
        platform: "telegram",
        external_user_id: "111",
        external_username: "Long".repeat(40),
        status: "assigned",
        assigned_member_user_id: uid,
      })
      .execute();
    await db
      .insertInto("communication_message")
      .values({
        id: randomUUID(),
        business_id: business,
        conversation_id: conversation,
        direction: "inbound",
        text: "Старая история",
        external_message_id: "legacy-id",
      })
      .execute();
    const columns = (
      await sql`select table_name,column_name from information_schema.columns where table_schema=current_schema() order by table_name,ordinal_position`.execute(
        db,
      )
    ).rows;
    const tables = new Map();
    for (const row of columns)
      if (row.table_name !== "sreda_migration")
        tables.set(row.table_name, [
          ...(tables.get(row.table_name) ?? []),
          row.column_name,
        ]);
    const snapshot = async () =>
      Object.fromEntries(
        await Promise.all(
          [...tables].map(async ([table, cols]) => [
            table,
            (await db.selectFrom(table).select(cols).execute())
              .map((row) => JSON.stringify(row))
              .sort(),
          ]),
        ),
      );
    const before = await snapshot();
    await migrate(db, directory);
    assert.deepEqual(
      await snapshot(),
      before,
      "old values, credentials, sessions and history must be unchanged",
    );
    assert.equal(
      (await db.selectFrom("lead").select("client_id").execute()).every(
        (row) => row.client_id,
      ),
      true,
    );
    const clients = await db.selectFrom("client").selectAll().execute();
    assert.equal(clients.length, 5);
    assert.ok(clients.every((c) => c.name.length > 0 && c.name.length <= 100));
    const outbox = await db.selectFrom("telegram_outbox").selectAll().execute();
    assert.equal(
      outbox.find((x) => x.message === "Sent legacy").delivery_state,
      "sent",
    );
    assert.equal(
      outbox.find((x) => x.message === "Pending legacy").delivery_state,
      "pending",
    );
    const migrations = await db
      .selectFrom("sreda_migration")
      .selectAll()
      .execute();
    await migrate(db, directory);
    assert.deepEqual(await snapshot(), before);
    assert.equal(
      (await db.selectFrom("client").select("id").execute()).length,
      5,
    );
    assert.deepEqual(
      await db.selectFrom("sreda_migration").selectAll().execute(),
      migrations,
    );
  } finally {
    await db?.destroy();
    if (admin) {
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    }
    await rm(temp, { recursive: true, force: true });
  }
});
