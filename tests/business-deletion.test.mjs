import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import {
  BusinessDeletionService,
  BUSINESS_DELETION_PHRASE,
} from "../src/server/business/deletion.ts";
import { getAvailableCustomerActions } from "../src/server/solutions/customer-actions.ts";

function isAppError(err, status, code) {
  return (
    err instanceof Error &&
    Number(err.status) === status &&
    (!code || String(err.code) === code)
  );
}

const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
const PASSWORD = "biz-delete-password-99";
const createdUsers = [];

before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(async () => {
  for (const userId of createdUsers) {
    await db.deleteFrom("session").where("userId", "=", userId).execute().catch(() => {});
    await db
      .deleteFrom("business_deletion_request")
      .where("user_id", "=", userId)
      .execute()
      .catch(() => {});
    await db.deleteFrom("account").where("userId", "=", userId).execute().catch(() => {});
  }
  await db.destroy();
});

async function makeUser(name = "User") {
  const id = randomUUID();
  await db
    .insertInto("user")
    .values({
      id,
      name,
      email: id + "@test.invalid",
      emailVerified: false,
      username: "u" + id.replace(/-/g, "").slice(0, 20),
    })
    .execute();
  await db
    .insertInto("account")
    .values({
      id: randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: await hashPassword(PASSWORD),
      updatedAt: new Date(),
    })
    .execute();
  createdUsers.push(id);
  return { id, name };
}

async function makeBusiness(ownerId, name) {
  const id = randomUUID();
  const publicId = "biz_" + randomUUID().replace(/-/g, "").slice(0, 20);
  await db
    .insertInto("business")
    .values({
      id,
      public_id: publicId,
      name,
      timezone: "Europe/Moscow",
    })
    .execute();
  await db
    .insertInto("business_member")
    .values({
      business_id: id,
      user_id: ownerId,
      role: "owner",
      status: "active",
    })
    .execute();
  return { id, publicId, name };
}

async function seedBusinessData(businessId) {
  await db
    .insertInto("business_solution")
    .values({
      business_id: businessId,
      solution_code: "orders",
      status: "active",
    })
    .execute();
  const connection = randomUUID();
  await db
    .insertInto("business_connection")
    .values({
      id: connection,
      business_id: businessId,
      platform: "telegram",
      status: "connected",
      external_account_id: randomUUID(),
      display_name: "bot",
    })
    .execute();
  await db
    .insertInto("connection_secret")
    .values({
      connection_id: connection,
      encrypted_token: "secret",
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
  const category = randomUUID();
  await db
    .insertInto("product_category")
    .values({
      id: category,
      business_id: businessId,
      name: "Кат",
      active: true,
      position: 0,
    })
    .execute();
  await db
    .insertInto("product")
    .values({
      id: randomUUID(),
      business_id: businessId,
      category_id: category,
      name: "Товар",
      description: "d",
      price: "10.00",
      currency: "RUB",
      active: true,
      position: 0,
      use_variants: false,
      track_inventory: false,
      availability: "in_stock",
    })
    .execute();
  await db
    .insertInto("client")
    .values({
      id: randomUUID(),
      business_id: businessId,
      name: "Клиент",
    })
    .execute();
  return connection;
}

test("owner can delete business with impact and confirmation", async () => {
  const owner = await makeUser("Owner");
  const biz = await makeBusiness(owner.id, "Удаляемый Бизнес");
  await seedBusinessData(biz.id);
  const service = new BusinessDeletionService(db);

  const impact = await service.impact(owner.id, biz.publicId);
  assert.equal(impact.name, "Удаляемый Бизнес");
  assert.equal(impact.alreadyDeleted, false);
  assert.ok(impact.products >= 1);
  assert.ok(impact.customers >= 1);
  assert.ok(impact.connections >= 1);
  assert.ok(impact.members >= 1);

  const req = await service.request(owner.id, biz.publicId);
  assert.ok(req.token.length >= 32);
  assert.equal(req.impact.products, impact.products);

  const result = await service.confirm(owner.id, biz.publicId, {
    token: req.token,
    password: PASSWORD,
    confirmation: BUSINESS_DELETION_PHRASE,
  });
  assert.equal(result.ok, true);
  assert.equal(result.alreadyDeleted, false);

  const archived = await db
    .selectFrom("business")
    .select(["archived_at"])
    .where("id", "=", biz.id)
    .executeTakeFirstOrThrow();
  assert.ok(archived.archived_at);

  const member = await db
    .selectFrom("business_member")
    .select("status")
    .where("business_id", "=", biz.id)
    .where("user_id", "=", owner.id)
    .executeTakeFirstOrThrow();
  assert.equal(member.status, "revoked");

  const solution = await db
    .selectFrom("business_solution")
    .select("status")
    .where("business_id", "=", biz.id)
    .where("solution_code", "=", "orders")
    .executeTakeFirstOrThrow();
  assert.equal(solution.status, "disabled");

  const connection = await db
    .selectFrom("business_connection")
    .select(["status", "external_account_id"])
    .where("business_id", "=", biz.id)
    .executeTakeFirstOrThrow();
  assert.equal(connection.status, "disconnected");
  assert.equal(connection.external_account_id, null);

  const secrets = await db
    .selectFrom("connection_secret")
    .select("connection_id")
    .innerJoin(
      "business_connection",
      "business_connection.id",
      "connection_secret.connection_id",
    )
    .where("business_connection.business_id", "=", biz.id)
    .execute();
  assert.equal(secrets.length, 0);

  const menu = await getAvailableCustomerActions(db, biz.id, "telegram");
  assert.deepEqual(menu.labels, []);

  const userStill = await db
    .selectFrom("user")
    .select("id")
    .where("id", "=", owner.id)
    .executeTakeFirst();
  assert.ok(userStill);
});

test("employee cannot delete business", async () => {
  const owner = await makeUser("Own");
  const employee = await makeUser("Emp");
  const biz = await makeBusiness(owner.id, "Team Biz");
  await db
    .insertInto("business_member")
    .values({
      business_id: biz.id,
      user_id: employee.id,
      role: "operator",
      status: "active",
    })
    .execute();
  const service = new BusinessDeletionService(db);
  await assert.rejects(
    () => service.impact(employee.id, biz.publicId),
    (e) => isAppError(e, 403, "FORBIDDEN"),
  );
  await assert.rejects(
    () => service.request(employee.id, biz.publicId),
    (e) => isAppError(e, 403),
  );
});

test("foreign businessId is rejected", async () => {
  const a = await makeUser("A");
  const b = await makeUser("B");
  const bizA = await makeBusiness(a.id, "A Biz");
  await makeBusiness(b.id, "B Biz");
  const service = new BusinessDeletionService(db);
  await assert.rejects(
    () => service.impact(b.id, bizA.publicId),
    (e) => isAppError(e, 404),
  );
});

test("multi-business isolation: deleting B keeps A and C", async () => {
  const owner = await makeUser("Multi");
  const a = await makeBusiness(owner.id, "Business A");
  const b = await makeBusiness(owner.id, "Business B");
  const c = await makeBusiness(owner.id, "Business C");
  await seedBusinessData(b.id);
  const connA = randomUUID();
  await db
    .insertInto("business_connection")
    .values({
      id: connA,
      business_id: a.id,
      platform: "telegram",
      status: "connected",
      external_account_id: "keep-a",
      display_name: "a-bot",
    })
    .execute();
  await db
    .insertInto("connection_secret")
    .values({
      connection_id: connA,
      encrypted_token: "keep",
      key_version: 1,
    })
    .execute();

  const service = new BusinessDeletionService(db);
  const req = await service.request(owner.id, b.publicId);
  await service.confirm(owner.id, b.publicId, {
    token: req.token,
    password: PASSWORD,
    confirmation: "Business B",
  });

  const aRow = await db
    .selectFrom("business")
    .select("archived_at")
    .where("id", "=", a.id)
    .executeTakeFirstOrThrow();
  const cRow = await db
    .selectFrom("business")
    .select("archived_at")
    .where("id", "=", c.id)
    .executeTakeFirstOrThrow();
  assert.equal(aRow.archived_at, null);
  assert.equal(cRow.archived_at, null);

  const aMember = await db
    .selectFrom("business_member")
    .select("status")
    .where("business_id", "=", a.id)
    .where("user_id", "=", owner.id)
    .executeTakeFirstOrThrow();
  assert.equal(aMember.status, "active");

  const aSecret = await db
    .selectFrom("connection_secret")
    .select("connection_id")
    .where("connection_id", "=", connA)
    .executeTakeFirst();
  assert.ok(aSecret);

  const user = await db
    .selectFrom("user")
    .select("id")
    .where("id", "=", owner.id)
    .executeTakeFirst();
  assert.ok(user);
});

test("repeat delete is idempotent", async () => {
  const owner = await makeUser("Idem");
  const biz = await makeBusiness(owner.id, "Once");
  const service = new BusinessDeletionService(db);
  const req = await service.request(owner.id, biz.publicId);
  await service.confirm(owner.id, biz.publicId, {
    token: req.token,
    password: PASSWORD,
    confirmation: BUSINESS_DELETION_PHRASE,
  });
  const again = await service.confirm(owner.id, biz.publicId, {
    token: "anything",
    password: PASSWORD,
    confirmation: BUSINESS_DELETION_PHRASE,
  });
  assert.equal(again.ok, true);
  assert.equal(again.alreadyDeleted, true);

  const impact = await service.impact(owner.id, biz.publicId);
  assert.equal(impact.alreadyDeleted, true);
});

test("confirmation mismatch and wrong password are rejected", async () => {
  const owner = await makeUser("Guard");
  const biz = await makeBusiness(owner.id, "Guard Biz");
  const service = new BusinessDeletionService(db);
  const req = await service.request(owner.id, biz.publicId);
  await assert.rejects(
    () =>
      service.confirm(owner.id, biz.publicId, {
        token: req.token,
        password: PASSWORD,
        confirmation: "не то",
      }),
    (e) => isAppError(e, 400, "CONFIRMATION_MISMATCH"),
  );
  await assert.rejects(
    () =>
      service.confirm(owner.id, biz.publicId, {
        token: req.token,
        password: "wrong-password-xx",
        confirmation: BUSINESS_DELETION_PHRASE,
      }),
    (e) => isAppError(e, 403, "INVALID_PASSWORD"),
  );
  const still = await db
    .selectFrom("business")
    .select("archived_at")
    .where("id", "=", biz.id)
    .executeTakeFirstOrThrow();
  assert.equal(still.archived_at, null);
});
