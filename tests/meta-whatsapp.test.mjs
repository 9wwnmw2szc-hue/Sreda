import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { encryptSecret } from "../src/server/connections/crypto.ts";
import { MetaChannelService } from "../src/server/meta/service.ts";
import { CommunicationService } from "../src/server/communications/service.ts";
import { META_GRAPH_API_VERSION } from "../src/server/meta/config.ts";

const secret = "meta-whatsapp-fixture-secret-32ch!";
const appSecret = "wa-app-secret-value16";
const verifyToken = "wa-verify-token-16ch";

const testConfig = {
  appId: "wa-app",
  appSecret,
  webhookVerifyToken: verifyToken,
  graphApiVersion: META_GRAPH_API_VERSION,
  whatsappConfigId: "wa-config",
  instagramConfigId: "ig-config",
  enabled: true,
};

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
  await db
    .insertInto("user")
    .values({
      id: userId,
      name: "Owner",
      email: userId + "@test.invalid",
      emailVerified: false,
      username: "u" + userId.replace(/-/g, "").slice(0, 20),
    })
    .execute();
  const business = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "WA Biz " + suffix,
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

async function seedWhatsApp(businessId, phoneNumberId = "phone-1") {
  const connectionId = randomUUID();
  await db
    .insertInto("business_connection")
    .values({
      id: connectionId,
      business_id: businessId,
      platform: "whatsapp",
      external_account_id: phoneNumberId,
      display_name: "WhatsApp Test",
      status: "connected",
    })
    .execute();
  await db
    .insertInto("connection_secret")
    .values({
      connection_id: connectionId,
      encrypted_token: encryptSecret("wa-access-token", secret),
      key_version: 1,
    })
    .execute();
  await db
    .insertInto("meta_runtime")
    .values({
      connection_id: connectionId,
      generation: randomUUID(),
      status: "ready",
      waba_id: "waba-1",
      phone_number_id: phoneNumberId,
      display_phone_number: "+79990001122",
      page_id: null,
      ig_user_id: null,
      ig_username: null,
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
    testConfig,
  );
}

test("whatsapp webhook verify returns challenge", () => {
  const challenge = service().handleWebhookVerify(
    "subscribe",
    verifyToken,
    "12345",
  );
  assert.equal(challenge, "12345");
  assert.throws(
    () => service().handleWebhookVerify("subscribe", "wrong", "1"),
    (e) => e && e.code === "INVALID_WEBHOOK" && e.status === 403,
  );
});

test("whatsapp webhook rejects bad signature", async () => {
  await assert.rejects(
    () =>
      service().receiveWebhook(
        '{"object":"whatsapp_business_account"}',
        "sha256=deadbeef",
      ),
    (e) => e && e.code === "INVALID_SIGNATURE",
  );
});

test("whatsapp inbound text creates conversation and dedupes", async () => {
  const { businessId } = await seedBusiness("in");
  const connectionId = await seedWhatsApp(businessId, "phone-in");
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "phone-in" },
              contacts: [{ wa_id: "79991112233", profile: { name: "Анна" } }],
              messages: [
                {
                  from: "79991112233",
                  id: "wamid.1",
                  timestamp: "1710000000",
                  type: "text",
                  text: { body: "Здравствуйте" },
                },
              ],
            },
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
    .where("platform", "=", "whatsapp")
    .executeTakeFirst();
  assert.ok(conversation);
  assert.equal(conversation.external_user_id, "79991112233");
  assert.ok(conversation.last_inbound_at);
  const messages = await db
    .selectFrom("communication_message")
    .selectAll()
    .where("business_id", "=", businessId)
    .execute();
  assert.equal(messages.length, 1);
  await service().receiveWebhook(body, sign(body));
  const again = await db
    .selectFrom("communication_message")
    .selectAll()
    .where("business_id", "=", businessId)
    .execute();
  assert.equal(again.length, 1);
  const updates = await db
    .selectFrom("meta_update")
    .selectAll()
    .where("connection_id", "=", connectionId)
    .execute();
  assert.equal(updates.length, 1);
});

test("whatsapp outbound freeform fails outside 24h window", async () => {
  const { userId, businessId, publicId } = await seedBusiness("win");
  const connectionId = await seedWhatsApp(businessId, "phone-win");
  const conversationId = randomUUID();
  await db
    .insertInto("communication_conversation")
    .values({
      id: conversationId,
      business_id: businessId,
      platform: "whatsapp",
      external_user_id: "79990000001",
      external_username: null,
      status: "open",
      assigned_member_user_id: null,
      last_message_at: new Date(Date.now() - 48 * 3600 * 1000),
      last_inbound_at: new Date(Date.now() - 48 * 3600 * 1000),
      created_at: new Date(),
      closed_at: null,
    })
    .execute();
  const communications = new CommunicationService(db);
  await assert.rejects(
    () =>
      communications.sendMessage(userId, publicId, conversationId, {
        text: "Ответ вне окна",
      }),
    (e) => e && e.code === "WHATSAPP_WINDOW_CLOSED" && e.status === 409,
  );
  const outbox = await db
    .selectFrom("meta_outbox")
    .selectAll()
    .where("connection_id", "=", connectionId)
    .execute();
  assert.equal(outbox.length, 0);
});

test("whatsapp webhook resolves tenant by phone_number_id only", async () => {
  const a = await seedBusiness("iso-a");
  const b = await seedBusiness("iso-b");
  await seedWhatsApp(a.businessId, "phone-iso-a");
  await seedWhatsApp(b.businessId, "phone-iso-b");
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            value: {
              metadata: { phone_number_id: "phone-iso-b" },
              messages: [
                {
                  from: "79995556677",
                  id: "wamid.iso",
                  type: "text",
                  text: { body: "Только B" },
                },
              ],
            },
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
  assert.equal(forA.length, 0);
  assert.equal(forB.length, 1);
  assert.equal(forB[0].external_user_id, "79995556677");
});
