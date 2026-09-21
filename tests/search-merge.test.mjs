import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { ClientService } from "../src/server/clients/service.ts";
import { BusinessSearchService } from "../src/server/search/service.ts";

const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

async function fixture(name = "Business") {
  const uid = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: uid,
      name: "Admin",
      email: uid + "@test.invalid",
      emailVerified: false,
      username: "u" + uid,
    })
    .execute();
  const b = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name,
      timezone: "Europe/Kaliningrad",
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

test("business search finds clients/orders/products and isolates tenants", async () => {
  const a = await fixture("A");
  const other = await fixture("B");
  const clients = new ClientService(db);
  const search = new BusinessSearchService(db);

  const { id: clientA } = await clients.save(a.uid, a.b.public_id, {
    name: "Иван Петров",
    phone: "+79991112233",
  });
  await clients.save(other.uid, other.b.public_id, {
    name: "Иван Петров",
    phone: "+79991112233",
  });

  const category = await db
    .insertInto("product_category")
    .values({
      id: randomUUID(),
      business_id: a.b.id,
      name: "Основное",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const productId = randomUUID();
  await db
    .insertInto("product")
    .values({
      id: productId,
      business_id: a.b.id,
      category_id: category.id,
      name: "Кофе зерновой",
      price: "500.00",
      sku: "COFFEE-42",
    })
    .execute();
  const orderId = randomUUID();
  await db
    .insertInto("order")
    .values({
      id: orderId,
      business_id: a.b.id,
      client_id: clientA,
      fulfillment: "pickup",
      customer_name: "Иван",
      customer_phone: "+79991112233",
      total: "500.00",
      items_snapshot: JSON.stringify([]),
      source: "web",
      request_key: "rk-" + orderId,
      request_hash: "hash-" + orderId,
      order_number: 1042,
    })
    .execute();
  await db
    .insertInto("lead")
    .values({
      id: randomUUID(),
      business_id: a.b.id,
      source: "telegram",
      name: "Иван заявка",
      phone: "+79991112233",
      client_id: clientA,
    })
    .execute();

  const hit = await search.search(a.uid, a.b.public_id, "Иван", "20");
  assert.ok(hit.items.some((i) => i.type === "client" && i.id === clientA));
  assert.ok(hit.items.some((i) => i.type === "lead"));
  const bySku = await search.search(a.uid, a.b.public_id, "COFFEE", "10");
  assert.ok(bySku.items.some((i) => i.type === "product" && i.id === productId));
  const byOrder = await search.search(a.uid, a.b.public_id, "1042", "10");
  assert.ok(byOrder.items.some((i) => i.type === "order" && i.id === orderId));

  const isolated = await search.search(other.uid, other.b.public_id, "Иван", "20");
  assert.equal(
    isolated.items.some((i) => i.id === clientA || i.id === orderId || i.id === productId),
    false,
  );
  await assert.rejects(
    search.search(other.uid, a.b.public_id, "Иван"),
    (e) => e.code === "BUSINESS_NOT_FOUND",
  );
  await assert.rejects(
    search.search(a.uid, a.b.public_id, "x"),
    (e) => e.code === "INVALID_SEARCH",
  );
});

test("client merge moves related rows, archives source, and rejects cross-business", async () => {
  const a = await fixture("MergeA");
  const other = await fixture("MergeB");
  const clients = new ClientService(db);

  const { id: targetId } = await clients.save(a.uid, a.b.public_id, {
    name: "Цель",
    phone: "+79990001111",
  });
  const { id: sourceId } = await clients.save(a.uid, a.b.public_id, {
    name: "Источник",
    phone: "+79990002222",
  });
  const { id: foreignId } = await clients.save(other.uid, other.b.public_id, {
    name: "Чужой",
    phone: "+79990003333",
  });

  await db
    .insertInto("client_identity")
    .values({
      business_id: a.b.id,
      client_id: sourceId,
      kind: "telegram",
      value: "9001",
      username: "source_user",
    })
    .execute();
  const leadId = randomUUID();
  await db
    .insertInto("lead")
    .values({
      id: leadId,
      business_id: a.b.id,
      source: "telegram",
      name: "Источник",
      client_id: sourceId,
    })
    .execute();
  const noteId = randomUUID();
  await db
    .insertInto("client_note")
    .values({
      id: noteId,
      business_id: a.b.id,
      client_id: sourceId,
      actor_user_id: a.uid,
      text: "Заметка источника",
    })
    .execute();
  const conversationId = randomUUID();
  await db
    .insertInto("communication_conversation")
    .values({
      id: conversationId,
      business_id: a.b.id,
      platform: "telegram",
      external_user_id: "9001",
      client_id: sourceId,
    })
    .execute();
  const orderId = randomUUID();
  await db
    .insertInto("order")
    .values({
      id: orderId,
      business_id: a.b.id,
      client_id: sourceId,
      fulfillment: "pickup",
      customer_name: "Источник",
      customer_phone: "+79990002222",
      total: "10.00",
      items_snapshot: JSON.stringify([]),
      source: "web",
      request_key: "merge-" + orderId,
      request_hash: "merge-hash-" + orderId,
    })
    .execute();

  const result = await clients.merge(a.uid, a.b.public_id, {
    source_client_id: sourceId,
    target_client_id: targetId,
  });
  assert.equal(result.target_client_id, targetId);

  const list = await clients.list(a.uid, a.b.public_id);
  assert.equal(list.some((c) => c.id === sourceId), false);
  assert.ok(list.some((c) => c.id === targetId));

  const detail = await clients.detail(a.uid, a.b.public_id, targetId);
  assert.ok(detail.identities.some((i) => i.kind === "telegram" && i.value === "9001"));
  assert.ok(detail.leads.some((l) => l.id === leadId));
  assert.ok(detail.notes.some((n) => n.id === noteId));
  assert.ok(detail.conversations.some((c) => c.id === conversationId));
  assert.ok(detail.orders.some((o) => o.id === orderId));

  const archived = await db
    .selectFrom("client")
    .select(["archived_at", "merged_into_id"])
    .where("id", "=", sourceId)
    .executeTakeFirstOrThrow();
  assert.ok(archived.archived_at);
  assert.equal(archived.merged_into_id, targetId);

  const auditRow = await db
    .selectFrom("business_audit_log")
    .selectAll()
    .where("business_id", "=", a.b.id)
    .where("action", "=", "client_merged")
    .executeTakeFirst();
  assert.ok(auditRow);

  await assert.rejects(
    clients.merge(a.uid, a.b.public_id, {
      source_client_id: foreignId,
      target_client_id: targetId,
    }),
    (e) => e.code === "CLIENT_NOT_FOUND",
  );
  await assert.rejects(
    clients.merge(other.uid, a.b.public_id, {
      source_client_id: sourceId,
      target_client_id: targetId,
    }),
    (e) => e.code === "BUSINESS_NOT_FOUND",
  );
});
