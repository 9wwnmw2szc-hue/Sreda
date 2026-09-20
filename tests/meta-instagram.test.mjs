import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { encryptSecret } from "../src/server/connections/crypto.ts";
import { MetaChannelService } from "../src/server/meta/service.ts";
import { CommunicationService } from "../src/server/communications/service.ts";
import { AppError } from "../src/server/http/errors.ts";

const secret = "meta-instagram-fixture-secret-32!";
const appSecret = "meta-ig-app-secret16";
const verifyToken = "meta-ig-verify-token16";

process.env.META_APP_ID = "ig-app";
process.env.META_APP_SECRET = appSecret;
process.env.META_WEBHOOK_VERIFY_TOKEN = verifyToken;
process.env.META_WEBHOOKS_ENABLED = "true";
process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID = "wa-config";
process.env.META_INSTAGRAM_LOGIN_CONFIG_ID = "ig-config";

const db = new Kysely({
  dialect: new PGliteDialect({ pglite: new PGlite() }),
});

before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(async () => {
  await db.destroy();
});

function sign(body) {
  return (
    "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex")
  );
}

async function seedBusiness(suffix = "a") {
  const userId = randomUUID();
  await db.insertInto("user").values({
    id: userId,
    name: "Owner",
    email: userId + "@test.invalid",
    emailVerified: false,
    username: "u" + userId.replace(/-/g, "").slice(0, 20),
  }).execute();
  const business = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "IG Biz " + suffix,
      timezone: "Europe/Moscow",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto("business_member")
    .values({
      business_id: business.id,
      user_id: userId,
      role: "owner",
      status: "active",
    })
    .execute();
  return { userId, businessId: business.id, publicId: business.public_id };
}

async function seedInstagram(businessId, pageId = "page-1", igUserId = "ig-1") {
  const connectionId = randomUUID();
  await db
    .insertInto("business_connection")
    .values({
      id: connectionId,
      business_id: businessId,
      platform: "instagram",
      external_account_id: igUserId,
      display_name: "@shop",
      status: "connected",
    })
    .execute();
  await db
    .insertInto("connection_secret")
    .values({
      connection_id: connectionId,
      encrypted_token: encryptSecret("ig-page-token", secret),
      key_version: 1,
    })
    .execute();
  await db
    .insertInto("meta_runtime")
    .values({
      connection_id: connectionId,
      generation: randomUUID(),
      status: "ready",
      waba_id: null,
      phone_number_id: null,
      display_phone_number: null,
      page_id: pageId,
      ig_user_id: igUserId,
      ig_username: "shop",
      webhook_subscribed: true,
      last_error: null,
    })
    .execute();
  return connectionId;
}

function service(transport = fetch) {
  return new MetaChannelService(
    db,
    secret,
    true,
    new CommunicationService(db),
    transport,
  );
}

test("instagram inbound creates conversation", async () => {
  const { businessId } = await seedBusiness("in");
  await seedInstagram(businessId, "page-in", "ig-in");
  const body = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: "page-in",
        messaging: [
          {
            sender: { id: "igsid-1" },
            recipient: { id: "page-in" },
            timestamp: Date.now(),
            message: { mid: "mid.1", text: "Привет из Instagram" },
          },
        ],
      },
    ],
  });
  await service().receiveWebhook(body, sign(body));
  const conversation = await db
    .selectFrom("communication_conversation")
    .selectAll()
    .where("business_id", "=", businessId)
    .where("platform", "=", "instagram")
    .executeTakeFirst();
  assert.ok(conversation);
  assert.equal(conversation.external_user_id, "igsid-1");
  const messages = await db
    .selectFrom("communication_message")
    .selectAll()
    .where("conversation_id", "=", conversation.id)
    .execute();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, "Привет из Instagram");
});

test("instagram outbound enqueues meta_outbox", async () => {
  const { userId, businessId, publicId } = await seedBusiness("out");
  const connectionId = await seedInstagram(businessId, "page-out", "ig-out");
  const conversationId = randomUUID();
  await db
    .insertInto("communication_conversation")
    .values({
      id: conversationId,
      business_id: businessId,
      platform: "instagram",
      external_user_id: "igsid-out",
      external_username: null,
      status: "open",
      assigned_member_user_id: null,
      last_message_at: new Date(),
      last_inbound_at: new Date(),
      created_at: new Date(),
      closed_at: null,
    })
    .execute();
  const result = await new CommunicationService(db).sendMessage(
    userId,
    publicId,
    conversationId,
    { text: "Ответ в Direct" },
  );
  assert.equal(result.deliveryStatus, "queued");
  const jobs = await db
    .selectFrom("meta_outbox")
    .selectAll()
    .where("connection_id", "=", connectionId)
    .execute();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].recipient_id, "igsid-out");
  assert.equal(jobs[0].message, "Ответ в Direct");
});

test("instagram webhook does not leak across tenants", async () => {
  const a = await seedBusiness("iso-a");
  const b = await seedBusiness("iso-b");
  await seedInstagram(a.businessId, "page-a", "ig-a");
  await seedInstagram(b.businessId, "page-b", "ig-b");
  const body = JSON.stringify({
    object: "page",
    entry: [
      {
        id: "page-a",
        messaging: [
          {
            sender: { id: "igsid-tenant" },
            recipient: { id: "page-a" },
            message: { mid: "mid.tenant", text: "Только A" },
          },
        ],
      },
    ],
  });
  await service().receiveWebhook(body, sign(body));
  const forA = await db
    .selectFrom("communication_conversation")
    .selectAll()
    .where("business_id", "=", a.businessId)
    .execute();
  const forB = await db
    .selectFrom("communication_conversation")
    .selectAll()
    .where("business_id", "=", b.businessId)
    .execute();
  assert.equal(forA.length, 1);
  assert.equal(forB.length, 0);
});

test("instagram deliverOne sends via Graph and marks sent", async () => {
  const { businessId } = await seedBusiness("del");
  const connectionId = await seedInstagram(businessId, "page-del", "ig-del");
  const messageId = randomUUID();
  const conversationId = randomUUID();
  await db
    .insertInto("communication_conversation")
    .values({
      id: conversationId,
      business_id: businessId,
      platform: "instagram",
      external_user_id: "igsid-del",
      external_username: null,
      status: "assigned",
      assigned_member_user_id: null,
      last_message_at: new Date(),
      last_inbound_at: new Date(),
      created_at: new Date(),
      closed_at: null,
    })
    .execute();
  await db
    .insertInto("communication_message")
    .values({
      id: messageId,
      conversation_id: conversationId,
      business_id: businessId,
      direction: "outbound",
      text: "Доставка",
      delivery_status: "queued",
      external_message_id: null,
      actor_user_id: null,
      moderation_status: "allowed",
      created_at: new Date(),
    })
    .execute();
  await db
    .insertInto("meta_outbox")
    .values({
      connection_id: connectionId,
      recipient_id: "igsid-del",
      message: "Доставка",
      communication_message_id: messageId,
    })
    .execute();
  let called = false;
  const transport = async (url, init) => {
    called = true;
    assert.match(String(url), /page-del\/messages/);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body || "{}"));
    assert.equal(body.recipient.id, "igsid-del");
    assert.ok(!JSON.stringify(body).includes("ig-page-token"));
    return {
      ok: true,
      status: 200,
      json: async () => ({ message_id: "mid.out.1" }),
    };
  };
  const worked = await service(transport).deliverOne();
  assert.equal(worked, true);
  assert.equal(called, true);
  const job = await db
    .selectFrom("meta_outbox")
    .selectAll()
    .where("connection_id", "=", connectionId)
    .executeTakeFirst();
  assert.equal(job.delivery_state, "sent");
  const msg = await db
    .selectFrom("communication_message")
    .select("delivery_status")
    .where("id", "=", messageId)
    .executeTakeFirst();
  assert.equal(msg.delivery_status, "sent");
});

test("instagram wrong signature rejected", async () => {
  await assert.rejects(
    () =>
      service().receiveWebhook(
        '{"object":"instagram","entry":[]}',
        "sha256=00",
      ),
    (e) => e instanceof AppError && e.code === "INVALID_SIGNATURE",
  );
});
