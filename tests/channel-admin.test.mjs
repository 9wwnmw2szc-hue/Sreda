import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Kysely, PGliteDialect, PostgresDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { migrate } from "../src/server/db/migrate.ts";
import { encryptSecret } from "../src/server/connections/crypto.ts";
import { ChannelAdminBindingService } from "../src/server/channel-admin/binding.ts";
import { routeChannelAdmin } from "../src/server/channel-admin/router.ts";

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
const secret = "channel-admin-test-secret-32chars!";
const createdBusinessIds = [];

before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(async () => {
  for (const businessId of createdBusinessIds) {
    const connections = await db
      .selectFrom("business_connection")
      .select("id")
      .where("business_id", "=", businessId)
      .execute()
      .catch(() => []);
    for (const row of connections) {
      await db
        .deleteFrom("connection_secret")
        .where("connection_id", "=", row.id)
        .execute()
        .catch(() => {});
      await db
        .deleteFrom("telegram_runtime")
        .where("connection_id", "=", row.id)
        .execute()
        .catch(() => {});
      await db
        .deleteFrom("vk_runtime")
        .where("connection_id", "=", row.id)
        .execute()
        .catch(() => {});
    }
    await db
      .deleteFrom("business_connection")
      .where("business_id", "=", businessId)
      .execute()
      .catch(() => {});
    await db
      .deleteFrom("channel_admin_session")
      .where("business_id", "=", businessId)
      .execute()
      .catch(() => {});
    await db
      .deleteFrom("channel_admin_challenge")
      .where("business_id", "=", businessId)
      .execute()
      .catch(() => {});
    await db
      .deleteFrom("business_channel_admin")
      .where("business_id", "=", businessId)
      .execute()
      .catch(() => {});
    await db
      .updateTable("business")
      .set({ archived_at: new Date() })
      .where("id", "=", businessId)
      .execute()
      .catch(() => {});
  }
  await db.destroy();
});

async function ownerBusiness(name = "ChannelAdminBiz") {
  const uid = randomUUID();
  const publicId = randomUUID();
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
  const u = await db
    .selectFrom("user")
    .select(["id", "public_id"])
    .where("id", "=", uid)
    .executeTakeFirstOrThrow();
  const b = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name,
      timezone: "Europe/Moscow",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  createdBusinessIds.push(b.id);
  await db
    .insertInto("business_member")
    .values({
      business_id: b.id,
      user_id: uid,
      role: "owner",
      status: "active",
    })
    .execute();
  void publicId;
  return { uid, b, userPublicId: u.public_id };
}

async function connectTelegram(businessId) {
  const connectionId = randomUUID();
  await db
    .insertInto("business_connection")
    .values({
      id: connectionId,
      business_id: businessId,
      platform: "telegram",
      external_account_id: randomUUID(),
      display_name: "bot",
      status: "connected",
    })
    .execute();
  await db
    .insertInto("connection_secret")
    .values({
      connection_id: connectionId,
      encrypted_token: encryptSecret("token", secret),
      encrypted_publish_token: null,
      key_version: 1,
    })
    .execute();
  await db
    .insertInto("telegram_runtime")
    .values({
      connection_id: connectionId,
      generation: randomUUID(),
      status: "ready",
    })
    .execute();
  return connectionId;
}

test("unverified /admin shows no-rights message", async () => {
  const { b } = await ownerBusiness("Unverified");
  const connectionId = await connectTelegram(b.id);
  const messages = [];
  await db.transaction().execute(async (tx) => {
    const handled = await routeChannelAdmin(
      tx,
      {
        businessId: b.id,
        connectionId,
        platform: "telegram",
        userId: "tg-stranger-1",
        eventId: "1",
        text: "/admin",
      },
      async (message) => {
        messages.push(message);
      },
    );
    assert.equal(handled, true);
  });
  assert.match(messages.join("\n"), /не подтверждён/i);
});

test("web challenge consume binds identity; reuse and expiry fail", async () => {
  const { uid, b, userPublicId } = await ownerBusiness("BindFlow");
  const connectionId = await connectTelegram(b.id);
  const service = new ChannelAdminBindingService(db);
  const challenge = await service.createWebChallenge(
    uid,
    b.public_id,
    "telegram",
  );
  assert.ok(challenge.token.length >= 32);
  assert.match(challenge.deepLinkHint, /^\/start admin_/);
  assert.equal(challenge.platform, "telegram");

  const externalUserId = "tg-owner-99";
  await db.transaction().execute(async (tx) => {
    const result = await service.consumeChallenge(tx, {
      businessId: b.id,
      connectionId,
      platform: "telegram",
      externalUserId,
      username: "owner_tg",
      token: challenge.token,
    });
    assert.equal(result.userId, uid);
    assert.equal(result.businessId, b.id);
  });

  const admin = await db.transaction().execute((tx) =>
    service.resolveAdmin(tx, {
      connectionId,
      businessId: b.id,
      platform: "telegram",
      externalUserId,
    }),
  );
  assert.ok(admin);
  assert.equal(admin.userId, uid);
  assert.ok(admin.permissions.includes("settings.manage"));

  await assert.rejects(
    () =>
      db.transaction().execute((tx) =>
        service.consumeChallenge(tx, {
          businessId: b.id,
          connectionId,
          platform: "telegram",
          externalUserId,
          token: challenge.token,
        }),
      ),
    (err) =>
      err instanceof Error &&
      (/уже использован/i.test(err.message) ||
        ("code" in err && err.code === "TOKEN_USED")),
  );

  const expired = await service.createWebChallenge(uid, b.public_id, "telegram");
  await db
    .updateTable("channel_admin_challenge")
    .set({ expires_at: new Date(Date.now() - 1000) })
    .where(
      "token_hash",
      "=",
      createHash("sha256").update(expired.token).digest("hex"),
    )
    .execute();
  await assert.rejects(
    () =>
      db.transaction().execute((tx) =>
        service.consumeChallenge(tx, {
          businessId: b.id,
          connectionId,
          platform: "telegram",
          externalUserId: "tg-other",
          token: expired.token,
        }),
      ),
    (err) =>
      err instanceof Error &&
      (/истёк|истек/i.test(err.message) ||
        ("code" in err && err.code === "TOKEN_EXPIRED")),
  );

  const listed = await service.list(uid, b.public_id);
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].externalUserId, externalUserId);
  assert.equal(listed.items[0].status, "active");
  assert.ok(!("token" in listed.items[0]));
  void userPublicId;
});

test("resolveAdmin requires active member", async () => {
  const { uid, b } = await ownerBusiness("MemberGate");
  const connectionId = await connectTelegram(b.id);
  const service = new ChannelAdminBindingService(db);
  const challenge = await service.createWebChallenge(
    uid,
    b.public_id,
    "telegram",
  );
  const externalUserId = "tg-member-gate";
  await db.transaction().execute((tx) =>
    service.consumeChallenge(tx, {
      businessId: b.id,
      connectionId,
      platform: "telegram",
      externalUserId,
      token: challenge.token,
    }),
  );

  await db
    .updateTable("business_member")
    .set({ status: "revoked" })
    .where("business_id", "=", b.id)
    .where("user_id", "=", uid)
    .execute();

  const resolved = await db.transaction().execute((tx) =>
    service.resolveAdmin(tx, {
      connectionId,
      businessId: b.id,
      platform: "telegram",
      externalUserId,
    }),
  );
  assert.equal(resolved, null);

  await db
    .updateTable("business_member")
    .set({ status: "active" })
    .where("business_id", "=", b.id)
    .where("user_id", "=", uid)
    .execute();
});

test("forged other-business entity access is denied", async () => {
  const a = await ownerBusiness("BizA");
  const other = await ownerBusiness("BizB");
  const connectionId = await connectTelegram(a.b.id);
  const service = new ChannelAdminBindingService(db);
  const challenge = await service.createWebChallenge(
    a.uid,
    a.b.public_id,
    "telegram",
  );
  const externalUserId = "tg-forge-1";
  await db.transaction().execute((tx) =>
    service.consumeChallenge(tx, {
      businessId: a.b.id,
      connectionId,
      platform: "telegram",
      externalUserId,
      token: challenge.token,
    }),
  );

  const foreignLeadId = randomUUID();
  await db
    .insertInto("lead")
    .values({
      id: foreignLeadId,
      business_id: other.b.id,
      source: "telegram",
      name: "Foreign",
      phone: null,
      message: "secret",
      status: "new",
    })
    .execute();

  const messages = [];
  await db.transaction().execute(async (tx) => {
    await routeChannelAdmin(
      tx,
      {
        businessId: a.b.id,
        connectionId,
        platform: "telegram",
        userId: externalUserId,
        eventId: "2",
        text: "/admin",
      },
      async (m) => {
        messages.push(m);
      },
    );
  });
  assert.ok(messages.some((m) => /Управление|Выберите раздел/i.test(m)));

  // Attempt to open foreign lead by planting it in session draft and sending status
  await db
    .insertInto("channel_admin_session")
    .values({
      connection_id: connectionId,
      external_user_id: externalUserId,
      platform: "telegram",
      user_id: a.uid,
      business_id: a.b.id,
      mode: "lead_detail",
      step: "",
      draft: JSON.stringify({ leadId: foreignLeadId }),
    })
    .onConflict((oc) =>
      oc.columns(["connection_id", "external_user_id", "platform"]).doUpdateSet({
        mode: "lead_detail",
        draft: JSON.stringify({ leadId: foreignLeadId }),
        business_id: a.b.id,
        user_id: a.uid,
        updated_at: new Date(),
      }),
    )
    .execute();

  await db
    .insertInto("business_solution")
    .values({
      business_id: a.b.id,
      solution_code: "leads",
      status: "active",
      starts_at: new Date(),
      expires_at: null,
    })
    .onConflict((oc) =>
      oc.columns(["business_id", "solution_code"]).doUpdateSet({
        status: "active",
        expires_at: null,
      }),
    )
    .execute();

  const out = [];
  await db.transaction().execute(async (tx) => {
    await routeChannelAdmin(
      tx,
      {
        businessId: a.b.id,
        connectionId,
        platform: "telegram",
        userId: externalUserId,
        eventId: "3",
        text: "processing",
      },
      async (m) => {
        out.push(m);
      },
    );
  });

  const foreign = await db
    .selectFrom("lead")
    .select("status")
    .where("id", "=", foreignLeadId)
    .executeTakeFirstOrThrow();
  assert.equal(foreign.status, "new");
  void out;
});

test("revoke removes access immediately", async () => {
  const { uid, b } = await ownerBusiness("RevokeFlow");
  const connectionId = await connectTelegram(b.id);
  const service = new ChannelAdminBindingService(db);
  const challenge = await service.createWebChallenge(
    uid,
    b.public_id,
    "telegram",
  );
  const externalUserId = "tg-revoke-1";
  await db.transaction().execute((tx) =>
    service.consumeChallenge(tx, {
      businessId: b.id,
      connectionId,
      platform: "telegram",
      externalUserId,
      token: challenge.token,
    }),
  );
  assert.ok(
    await db.transaction().execute((tx) =>
      service.resolveAdmin(tx, {
        connectionId,
        businessId: b.id,
        platform: "telegram",
        externalUserId,
      }),
    ),
  );

  await service.revoke(uid, b.public_id, "telegram");
  assert.equal(
    await db.transaction().execute((tx) =>
      service.resolveAdmin(tx, {
        connectionId,
        businessId: b.id,
        platform: "telegram",
        externalUserId,
      }),
    ),
    null,
  );

  const messages = [];
  await db.transaction().execute(async (tx) => {
    await routeChannelAdmin(
      tx,
      {
        businessId: b.id,
        connectionId,
        platform: "telegram",
        userId: externalUserId,
        eventId: "4",
        text: "/admin",
      },
      async (m) => {
        messages.push(m);
      },
    );
  });
  assert.match(messages.join("\n"), /не подтверждён/i);
});

test("wrong platform challenge is rejected", async () => {
  const { uid, b } = await ownerBusiness("WrongPlatform");
  const connectionId = await connectTelegram(b.id);
  const service = new ChannelAdminBindingService(db);
  const challenge = await service.createWebChallenge(
    uid,
    b.public_id,
    "telegram",
  );
  await assert.rejects(
    () =>
      db.transaction().execute((tx) =>
        service.consumeChallenge(tx, {
          businessId: b.id,
          connectionId,
          platform: "vk",
          externalUserId: "vk-wrong-1",
          token: challenge.token,
        }),
      ),
    (err) =>
      err instanceof Error &&
      (/другого бизнеса|канала|недействителен/i.test(err.message) ||
        ("code" in err &&
          (err.code === "TOKEN_MISMATCH" || err.code === "INVALID_TOKEN"))),
  );
});

test("operator binding cannot change business settings", async () => {
  const { uid, b } = await ownerBusiness("OperatorGate");
  const connectionId = await connectTelegram(b.id);
  const opId = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: opId,
      name: "Operator",
      email: opId + "@test.invalid",
      emailVerified: false,
      username: "op" + opId.replace(/-/g, "").slice(0, 18),
    })
    .execute();
  await db
    .insertInto("business_member")
    .values({
      business_id: b.id,
      user_id: opId,
      role: "operator",
      status: "active",
    })
    .execute();

  // Owner creates challenge for self; we need operator-bound challenge.
  // Operators cannot create challenges (settings.manage). Bind via direct consume
  // by creating challenge as owner then... challenges are user-bound, so create
  // as operator must fail:
  const service = new ChannelAdminBindingService(db);
  await assert.rejects(
    () => service.createWebChallenge(opId, b.public_id, "telegram"),
    (err) => err instanceof Error && /прав|FORBIDDEN/i.test(err.message),
  );

  // Owner binds own TG, then we downgrade role to operator to simulate limited perms
  const challenge = await service.createWebChallenge(
    uid,
    b.public_id,
    "telegram",
  );
  const externalUserId = "tg-op-gate";
  await db.transaction().execute((tx) =>
    service.consumeChallenge(tx, {
      businessId: b.id,
      connectionId,
      platform: "telegram",
      externalUserId,
      token: challenge.token,
    }),
  );
  await db
    .updateTable("business_member")
    .set({ role: "operator" })
    .where("business_id", "=", b.id)
    .where("user_id", "=", uid)
    .execute();

  const admin = await db.transaction().execute((tx) =>
    service.resolveAdmin(tx, {
      connectionId,
      businessId: b.id,
      platform: "telegram",
      externalUserId,
    }),
  );
  assert.ok(admin);
  assert.equal(admin.role, "operator");
  assert.ok(!admin.permissions.includes("settings.manage"));
  assert.ok(admin.permissions.includes("orders.write"));

  await db.transaction().execute(async (tx) => {
    await routeChannelAdmin(
      tx,
      {
        businessId: b.id,
        connectionId,
        platform: "telegram",
        userId: externalUserId,
        eventId: "op1",
        text: "/admin",
      },
      async () => {},
    );
  });
  await db.transaction().execute(async (tx) => {
    await routeChannelAdmin(
      tx,
      {
        businessId: b.id,
        connectionId,
        platform: "telegram",
        userId: externalUserId,
        eventId: "op2",
        text: "Изменить название",
      },
      async () => {},
    );
  });
  const out = [];
  await db.transaction().execute(async (tx) => {
    await routeChannelAdmin(
      tx,
      {
        businessId: b.id,
        connectionId,
        platform: "telegram",
        userId: externalUserId,
        eventId: "op3",
        text: "Hacked Name",
      },
      async (m) => {
        out.push(m);
      },
    );
  });
  const biz = await db
    .selectFrom("business")
    .select("name")
    .where("id", "=", b.id)
    .executeTakeFirstOrThrow();
  assert.notEqual(biz.name, "Hacked Name");
  assert.match(out.join("\n"), /прав|Недостаточно/i);
  void opId;
});

test("name change via telegram updates canonical business row", async () => {
  const { uid, b } = await ownerBusiness("ParityName");
  const connectionId = await connectTelegram(b.id);
  const service = new ChannelAdminBindingService(db);
  const challenge = await service.createWebChallenge(
    uid,
    b.public_id,
    "telegram",
  );
  const externalUserId = "tg-parity-1";
  await db.transaction().execute((tx) =>
    service.consumeChallenge(tx, {
      businessId: b.id,
      connectionId,
      platform: "telegram",
      externalUserId,
      token: challenge.token,
    }),
  );

  await db.transaction().execute(async (tx) => {
    await routeChannelAdmin(
      tx,
      {
        businessId: b.id,
        connectionId,
        platform: "telegram",
        userId: externalUserId,
        eventId: "p1",
        text: "/admin",
      },
      async () => {},
    );
  });
  await db.transaction().execute(async (tx) => {
    await routeChannelAdmin(
      tx,
      {
        businessId: b.id,
        connectionId,
        platform: "telegram",
        userId: externalUserId,
        eventId: "p2",
        text: "🏠 Бизнес / Настройки",
      },
      async () => {},
    );
  });
  await db.transaction().execute(async (tx) => {
    await routeChannelAdmin(
      tx,
      {
        businessId: b.id,
        connectionId,
        platform: "telegram",
        userId: externalUserId,
        eventId: "p3",
        text: "Изменить название",
      },
      async () => {},
    );
  });
  await db.transaction().execute(async (tx) => {
    await routeChannelAdmin(
      tx,
      {
        businessId: b.id,
        connectionId,
        platform: "telegram",
        userId: externalUserId,
        eventId: "p4",
        text: "Северный Барбершоп",
      },
      async () => {},
    );
  });

  const biz = await db
    .selectFrom("business")
    .select("name")
    .where("id", "=", b.id)
    .executeTakeFirstOrThrow();
  assert.equal(biz.name, "Северный Барбершоп");

  const logs = await db
    .selectFrom("business_audit_log")
    .select(["action", "metadata"])
    .where("business_id", "=", b.id)
    .where("action", "=", "settings_changed")
    .orderBy("created_at", "desc")
    .execute();
  const meta = logs
    .map((l) => {
      try {
        return typeof l.metadata === "string"
          ? JSON.parse(l.metadata)
          : l.metadata;
      } catch {
        return null;
      }
    })
    .find((m) => m && m.action === "channel_admin_name");
  assert.ok(meta);
  assert.equal(meta.channel, "telegram");
});

test("multi-business pick switches active context", async () => {
  const a = await ownerBusiness("MultiA");
  const b2 = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "MultiB",
      timezone: "Europe/Moscow",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  createdBusinessIds.push(b2.id);
  await db
    .insertInto("business_member")
    .values({
      business_id: b2.id,
      user_id: a.uid,
      role: "owner",
      status: "active",
    })
    .execute();

  const connA = await connectTelegram(a.b.id);
  const service = new ChannelAdminBindingService(db);
  const ch1 = await service.createWebChallenge(
    a.uid,
    a.b.public_id,
    "telegram",
  );
  await db.transaction().execute((tx) =>
    service.consumeChallenge(tx, {
      businessId: a.b.id,
      connectionId: connA,
      platform: "telegram",
      externalUserId: "tg-multi-1",
      token: ch1.token,
    }),
  );

  // Second business needs its own telegram connection for challenge creation
  const connB = await connectTelegram(b2.id);
  const ch2 = await service.createWebChallenge(a.uid, b2.public_id, "telegram");
  await db.transaction().execute((tx) =>
    service.consumeChallenge(tx, {
      businessId: b2.id,
      connectionId: connB,
      platform: "telegram",
      externalUserId: "tg-multi-1",
      token: ch2.token,
    }),
  );

  const list = await db.transaction().execute((tx) =>
    service.listBusinessesForIdentity(tx, "telegram", "tg-multi-1"),
  );
  assert.equal(list.length, 2);

  const messages = [];
  await db.transaction().execute(async (tx) => {
    await routeChannelAdmin(
      tx,
      {
        businessId: a.b.id,
        connectionId: connA,
        platform: "telegram",
        userId: "tg-multi-1",
        eventId: "m1",
        text: "/admin",
      },
      async (m) => {
        messages.push(m);
      },
    );
  });
  assert.match(messages.join("\n"), /Выберите бизнес|MultiA|MultiB/i);

  await db.transaction().execute(async (tx) => {
    await routeChannelAdmin(
      tx,
      {
        businessId: a.b.id,
        connectionId: connA,
        platform: "telegram",
        userId: "tg-multi-1",
        eventId: "m2",
        text: "MultiB",
      },
      async (m) => {
        messages.push(m);
      },
    );
  });
  assert.match(messages.join("\n"), /Переключено на «MultiB»|MultiB/i);
});
