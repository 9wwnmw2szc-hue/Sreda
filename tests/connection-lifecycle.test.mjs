import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { ConnectionService } from "../src/server/connections/service.ts";

const SECRET = "a".repeat(64);
const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

async function ownerBusiness(name = "Biz") {
  const uid = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: uid,
      name: "Owner",
      email: uid + "@test.invalid",
      emailVerified: false,
      username: "u" + uid.replace(/-/g, "").slice(0, 20),
    })
    .execute();
  const b = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name,
      timezone: "Europe/Moscow",
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

function telegramFetch(botId = 555001, username = "reclaim_bot") {
  return async (url) => {
    if (String(url).includes("/getMe")) {
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            id: botId,
            is_bot: true,
            username,
            first_name: "Bot",
          },
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 404 });
  };
}

test("reclaims orphan disconnected external_account_id for new business", async () => {
  const old = await ownerBusiness("Orphan Biz");
  const orphanId = randomUUID();
  await db
    .insertInto("business_connection")
    .values({
      id: orphanId,
      business_id: old.b.id,
      platform: "telegram",
      external_account_id: "555001",
      display_name: "@orphan",
      status: "disconnected",
    })
    .execute();
  await db
    .updateTable("business")
    .set({ archived_at: new Date() })
    .where("id", "=", old.b.id)
    .execute();

  const neu = await ownerBusiness("Fresh Biz");
  const service = new ConnectionService(db, SECRET, telegramFetch(555001));
  const result = await service.connect(neu.uid, neu.b.public_id, {
    platform: "telegram",
    token: "123456:AA-test-token-value-xxxxxx",
  });
  assert.equal(result.ok, true);

  const orphan = await db
    .selectFrom("business_connection")
    .select("external_account_id")
    .where("id", "=", orphanId)
    .executeTakeFirstOrThrow();
  assert.equal(orphan.external_account_id, null);

  const fresh = await db
    .selectFrom("business_connection")
    .select(["external_account_id", "status"])
    .where("business_id", "=", neu.b.id)
    .where("platform", "=", "telegram")
    .executeTakeFirstOrThrow();
  assert.equal(fresh.external_account_id, "555001");
  assert.equal(fresh.status, "connected");
});

test("live claim on accessible other business returns structured error", async () => {
  const a = await ownerBusiness("Biz A");
  const serviceA = new ConnectionService(db, SECRET, telegramFetch(666001, "a_bot"));
  await serviceA.connect(a.uid, a.b.public_id, {
    platform: "telegram",
    token: "123456:AA-token-a-xxxxxxxxxxxxxxx",
  });

  // Same user creates second business — bot already on Biz A
  const b2 = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "Biz B",
      timezone: "Europe/Moscow",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto("business_member")
    .values({
      business_id: b2.id,
      user_id: a.uid,
      role: "owner",
      status: "active",
    })
    .execute();

  const serviceB = new ConnectionService(db, SECRET, telegramFetch(666001, "a_bot"));
  await assert.rejects(
    () =>
      serviceB.connect(a.uid, b2.public_id, {
        platform: "telegram",
        token: "123456:AA-token-a-xxxxxxxxxxxxxxx",
      }),
    (err) =>
      err instanceof Error &&
      "code" in err &&
      err.code === "CONNECTION_IN_OTHER_BUSINESS" &&
      /Biz A/.test(err.message),
  );
});

test("foreign tenant live claim does not leak business name", async () => {
  const a = await ownerBusiness("Secret Tenant");
  const serviceA = new ConnectionService(db, SECRET, telegramFetch(777001, "secret"));
  await serviceA.connect(a.uid, a.b.public_id, {
    platform: "telegram",
    token: "123456:AA-token-secret-xxxxxxxxx",
  });

  const b = await ownerBusiness("Other Tenant");
  const serviceB = new ConnectionService(db, SECRET, telegramFetch(777001, "secret"));
  await assert.rejects(
    () =>
      serviceB.connect(b.uid, b.b.public_id, {
        platform: "telegram",
        token: "123456:AA-token-secret-xxxxxxxxx",
      }),
    (err) =>
      err instanceof Error &&
      "code" in err &&
      err.code === "CONNECTION_IN_USE" &&
      !/Secret Tenant/.test(err.message),
  );
});
