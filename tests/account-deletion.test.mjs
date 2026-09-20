import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Kysely, PGliteDialect, PostgresDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { migrate } from "../src/server/db/migrate.ts";
import {
  AccountDeletionService,
  ACCOUNT_DELETION_PHRASE,
} from "../src/server/account/deletion.ts";
import { loginCredential } from "../src/server/identity/login-guard.ts";

const usePg = !!process.env.TEST_DATABASE_URL;
const db = new Kysely({
  dialect: usePg
    ? new PostgresDialect({
        pool: new Pool({
          connectionString: process.env.TEST_DATABASE_URL,
          max: 8,
        }),
      })
    : new PGliteDialect({ pglite: new PGlite() }),
});

const PASSWORD = "deletion-test-password-99";
const createdUsers = [];

before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(async () => {
  for (const userId of createdUsers) {
    await db.deleteFrom("session").where("userId", "=", userId).execute().catch(() => {});
    await db
      .deleteFrom("account_deletion_request")
      .where("user_id", "=", userId)
      .execute()
      .catch(() => {});
    await db
      .deleteFrom("account_security_event")
      .where("user_id", "=", userId)
      .execute()
      .catch(() => {});
    await db.deleteFrom("account").where("userId", "=", userId).execute().catch(() => {});
    await db
      .deleteFrom("notification_binding")
      .where("user_id", "=", userId)
      .execute()
      .catch(() => {});
    await db
      .deleteFrom("business_member")
      .where("user_id", "=", userId)
      .execute()
      .catch(() => {});
  }
  await db.destroy();
});

async function makeUser(name = "User") {
  const id = randomUUID();
  const publicId = "usr_" + randomUUID().replace(/-/g, "").slice(0, 20);
  const username = "u" + id.replace(/-/g, "").slice(0, 20);
  await db
    .insertInto("user")
    .values({
      id,
      name,
      email: id + "@test.invalid",
      emailVerified: false,
      username,
      public_id: publicId,
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
  await db
    .insertInto("session")
    .values({
      id: randomUUID(),
      userId: id,
      token: "tok-" + id,
      expiresAt: new Date(Date.now() + 86400000),
      updatedAt: new Date(),
    })
    .execute();
  createdUsers.push(id);
  return { id, publicId, username };
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

async function addMember(businessId, userId, role = "admin") {
  await db
    .insertInto("business_member")
    .values({
      business_id: businessId,
      user_id: userId,
      role,
      status: "active",
    })
    .execute();
}

test("user without businesses can delete account", async () => {
  const user = await makeUser("Solo");
  const service = new AccountDeletionService(db);
  const impact = await service.impact(user.id);
  assert.equal(impact.ownedBusinesses.length, 0);
  assert.equal(impact.canDeleteImmediately, true);

  const req = await service.request(user.id);
  assert.ok(req.token.length >= 32);
  const result = await service.confirm(user.id, {
    token: req.token,
    password: PASSWORD,
    confirmation: ACCOUNT_DELETION_PHRASE,
    decisions: [],
  });
  assert.equal(result.ok, true);

  const row = await db
    .selectFrom("user")
    .select(["name", "username", "deletion_status", "deleted_at"])
    .where("id", "=", user.id)
    .executeTakeFirstOrThrow();
  assert.equal(row.deletion_status, "deleted");
  assert.ok(row.deleted_at);
  assert.equal(row.name, "Удалённый пользователь");
  assert.match(row.username, /^deleted_/);

  const sessions = await db
    .selectFrom("session")
    .selectAll()
    .where("userId", "=", user.id)
    .execute();
  assert.equal(sessions.length, 0);

  const account = await db
    .selectFrom("account")
    .select("password")
    .where("userId", "=", user.id)
    .executeTakeFirstOrThrow();
  assert.equal(account.password, null);

  assert.equal(await loginCredential(db, user.username), undefined);
  assert.equal(await loginCredential(db, row.username), undefined);

  // Idempotent confirm
  const again = await service.confirm(user.id, {
    token: req.token,
    password: PASSWORD,
    confirmation: ACCOUNT_DELETION_PHRASE,
  });
  assert.equal(again.alreadyDeleted, true);
});

test("sole owner must archive business", async () => {
  const user = await makeUser("OwnerOnly");
  const biz = await makeBusiness(user.id, "Solo Shop");
  const service = new AccountDeletionService(db);
  const impact = await service.impact(user.id);
  assert.equal(impact.ownedBusinesses.length, 1);
  assert.equal(impact.canDeleteImmediately, false);

  const req = await service.request(user.id);
  await assert.rejects(
    () =>
      service.confirm(user.id, {
        token: req.token,
        password: PASSWORD,
        confirmation: ACCOUNT_DELETION_PHRASE,
        decisions: [],
      }),
    (err) => err instanceof Error && /действие для бизнеса/i.test(err.message),
  );

  const req2 = await service.request(user.id);
  await service.confirm(user.id, {
    token: req2.token,
    password: PASSWORD,
    confirmation: ACCOUNT_DELETION_PHRASE,
    decisions: [{ businessId: biz.publicId, action: "archive" }],
  });

  const archived = await db
    .selectFrom("business")
    .select("archived_at")
    .where("id", "=", biz.id)
    .executeTakeFirstOrThrow();
  assert.ok(archived.archived_at);

  const members = await db
    .selectFrom("business_member")
    .select("status")
    .where("business_id", "=", biz.id)
    .execute();
  assert.ok(members.every((m) => m.status === "revoked"));
});

test("sole owner can transfer to another member; business survives", async () => {
  const owner = await makeUser("OwnerA");
  const admin = await makeUser("AdminB");
  const biz = await makeBusiness(owner.id, "Shared Shop");
  await addMember(biz.id, admin.id, "admin");

  // Business data that must survive
  const leadId = randomUUID();
  await db
    .insertInto("lead")
    .values({
      id: leadId,
      business_id: biz.id,
      source: "telegram",
      name: "Client",
      phone: null,
      message: "keep me",
      status: "new",
    })
    .execute();

  const service = new AccountDeletionService(db);
  const req = await service.request(owner.id);
  await service.confirm(owner.id, {
    token: req.token,
    password: PASSWORD,
    confirmation: ACCOUNT_DELETION_PHRASE,
    decisions: [
      {
        businessId: biz.publicId,
        action: "transfer",
        transferToUserId: admin.publicId,
      },
    ],
  });

  const bizRow = await db
    .selectFrom("business")
    .select(["archived_at", "name"])
    .where("id", "=", biz.id)
    .executeTakeFirstOrThrow();
  assert.equal(bizRow.archived_at, null);
  assert.equal(bizRow.name, "Shared Shop");

  const ownerMem = await db
    .selectFrom("business_member")
    .select(["role", "status"])
    .where("business_id", "=", biz.id)
    .where("user_id", "=", owner.id)
    .executeTakeFirstOrThrow();
  assert.equal(ownerMem.status, "revoked");

  const adminMem = await db
    .selectFrom("business_member")
    .select(["role", "status"])
    .where("business_id", "=", biz.id)
    .where("user_id", "=", admin.id)
    .executeTakeFirstOrThrow();
  assert.equal(adminMem.role, "owner");
  assert.equal(adminMem.status, "active");

  const lead = await db
    .selectFrom("lead")
    .select("message")
    .where("id", "=", leadId)
    .executeTakeFirstOrThrow();
  assert.equal(lead.message, "keep me");
});

test("member-only user leaves business intact", async () => {
  const owner = await makeUser("KeepOwner");
  const member = await makeUser("LeavingMember");
  const biz = await makeBusiness(owner.id, "Team Biz");
  await addMember(biz.id, member.id, "operator");

  const service = new AccountDeletionService(db);
  const impact = await service.impact(member.id);
  assert.equal(impact.ownedBusinesses.length, 0);
  assert.equal(impact.memberBusinesses.length, 1);

  const req = await service.request(member.id);
  await service.confirm(member.id, {
    token: req.token,
    password: PASSWORD,
    confirmation: ACCOUNT_DELETION_PHRASE,
    decisions: [],
  });

  const bizRow = await db
    .selectFrom("business")
    .select("archived_at")
    .where("id", "=", biz.id)
    .executeTakeFirstOrThrow();
  assert.equal(bizRow.archived_at, null);

  const ownerMem = await db
    .selectFrom("business_member")
    .select(["role", "status"])
    .where("business_id", "=", biz.id)
    .where("user_id", "=", owner.id)
    .executeTakeFirstOrThrow();
  assert.equal(ownerMem.role, "owner");
  assert.equal(ownerMem.status, "active");
});

test("wrong password / wrong phrase / reused token rejected", async () => {
  const user = await makeUser("Secure");
  const service = new AccountDeletionService(db);
  const req = await service.request(user.id);

  await assert.rejects(
    () =>
      service.confirm(user.id, {
        token: req.token,
        password: "wrong-password-xx",
        confirmation: ACCOUNT_DELETION_PHRASE,
      }),
    (err) => err instanceof Error && /пароль/i.test(err.message),
  );

  await assert.rejects(
    () =>
      service.confirm(user.id, {
        token: req.token,
        password: PASSWORD,
        confirmation: "DELETE",
      }),
    (err) => err instanceof Error && /УДАЛИТЬ/i.test(err.message),
  );

  await service.confirm(user.id, {
    token: req.token,
    password: PASSWORD,
    confirmation: ACCOUNT_DELETION_PHRASE,
  });

  const other = await makeUser("Other");
  const otherReq = await service.request(other.id);
  await assert.rejects(
    () =>
      service.confirm(other.id, {
        token: req.token,
        password: PASSWORD,
        confirmation: ACCOUNT_DELETION_PHRASE,
      }),
    (err) => err instanceof Error && /недействителен|использован/i.test(err.message),
  );
  await service.confirm(other.id, {
    token: otherReq.token,
    password: PASSWORD,
    confirmation: ACCOUNT_DELETION_PHRASE,
  });
});

test("expired deletion request rejected", async () => {
  const user = await makeUser("Expired");
  const service = new AccountDeletionService(db);
  const req = await service.request(user.id);
  await db
    .updateTable("account_deletion_request")
    .set({ expires_at: new Date(Date.now() - 1000) })
    .where("user_id", "=", user.id)
    .execute();
  await assert.rejects(
    () =>
      service.confirm(user.id, {
        token: req.token,
        password: PASSWORD,
        confirmation: ACCOUNT_DELETION_PHRASE,
      }),
    (err) => err instanceof Error && /истёк|истек/i.test(err.message),
  );
});

test("multiple owned businesses require per-business decisions", async () => {
  const user = await makeUser("MultiOwner");
  const a = await makeBusiness(user.id, "Biz A");
  const b = await makeBusiness(user.id, "Biz B");
  const service = new AccountDeletionService(db);
  const impact = await service.impact(user.id);
  assert.equal(impact.ownedBusinesses.length, 2);

  const req = await service.request(user.id);
  await service.confirm(user.id, {
    token: req.token,
    password: PASSWORD,
    confirmation: ACCOUNT_DELETION_PHRASE,
    decisions: [
      { businessId: a.publicId, action: "archive" },
      { businessId: b.publicId, action: "archive" },
    ],
  });

  for (const biz of [a, b]) {
    const row = await db
      .selectFrom("business")
      .select("archived_at")
      .where("id", "=", biz.id)
      .executeTakeFirstOrThrow();
    assert.ok(row.archived_at);
  }
});

test("audit events recorded without secrets", async () => {
  const user = await makeUser("Audited");
  const service = new AccountDeletionService(db);
  const req = await service.request(user.id);
  await service.confirm(user.id, {
    token: req.token,
    password: PASSWORD,
    confirmation: ACCOUNT_DELETION_PHRASE,
  });
  const events = await db
    .selectFrom("account_security_event")
    .select("action")
    .where("user_id", "=", user.id)
    .orderBy("created_at")
    .execute();
  const actions = events.map((e) => e.action);
  assert.ok(actions.includes("account_deletion_requested"));
  assert.ok(actions.includes("account_deletion_completed"));
});
