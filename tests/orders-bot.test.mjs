import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { routeBot } from "../src/server/bot/router.ts";

const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

async function fixture() {
  const owner = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: owner,
      name: "Owner",
      email: owner + "@test.invalid",
      emailVerified: false,
      username: "u" + owner,
    })
    .execute();
  const b = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "Shop",
      public_name: "Магазин",
      timezone: "Europe/Moscow",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto("business_member")
    .values({
      business_id: b.id,
      user_id: owner,
      role: "owner",
      status: "active",
    })
    .execute();
  await db
    .insertInto("business_solution")
    .values({
      business_id: b.id,
      solution_code: "orders",
      status: "active",
    })
    .execute();
  await db
    .insertInto("business_solution")
    .values({
      business_id: b.id,
      solution_code: "admin_messages",
      status: "active",
    })
    .execute();
  const connection = randomUUID();
  await db
    .insertInto("business_connection")
    .values({
      id: connection,
      business_id: b.id,
      platform: "telegram",
      status: "connected",
      external_account_id: randomUUID(),
      display_name: "shop-bot",
    })
    .execute();
  await db
    .insertInto("connection_secret")
    .values({
      connection_id: connection,
      encrypted_token: "x",
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
      business_id: b.id,
      name: "Чай",
      active: true,
      position: 0,
    })
    .execute();
  const product = randomUUID();
  await db
    .insertInto("product")
    .values({
      id: product,
      business_id: b.id,
      category_id: category,
      name: "Улун",
      description: "Лёгкий чай",
      price: "350.00",
      currency: "RUB",
      active: true,
      position: 0,
      use_variants: false,
      track_inventory: false,
      availability: "in_stock",
    })
    .execute();
  return { b, connection, product, category, owner };
}

test("orders bot flow: catalog → cart → checkout stores conversation_id", async () => {
  const f = await fixture();
  let event = 0;
  const send = (text) =>
    db.transaction().execute((tx) =>
      routeBot(tx, {
        businessId: f.b.id,
        connectionId: f.connection,
        platform: "telegram",
        userId: "4242",
        eventId: String(++event),
        text,
      }),
    );
  const mode = async () =>
    (
      await db
        .selectFrom("telegram_dialog")
        .select("mode")
        .where("connection_id", "=", f.connection)
        .where("chat_id", "=", "4242")
        .executeTakeFirstOrThrow()
    ).mode;

  await send("/start");
  assert.equal(await mode(), "menu");
  await send("Каталог");
  assert.equal(await mode(), "orders:categories");
  await send("1. Чай");
  assert.equal(await mode(), "orders:products");
  await send("1. Улун · 350.00 RUB");
  assert.equal(await mode(), "orders:qty");
  await send("2");
  assert.equal(await mode(), "orders:cart");

  const cart = await db
    .selectFrom("cart_item as i")
    .innerJoin("cart as c", "c.id", "i.cart_id")
    .select(["i.quantity", "i.product_id"])
    .where("c.business_id", "=", f.b.id)
    .where("c.external_user_id", "=", "4242")
    .executeTakeFirstOrThrow();
  assert.equal(cart.quantity, 2);
  assert.equal(cart.product_id, f.product);

  await send("Оформить заказ");
  assert.equal(await mode(), "orders:checkout_name");
  await send("Анна");
  await send("+79991234567");
  await send("Самовывоз");
  await send("/skip");
  assert.equal(await mode(), "orders:checkout_confirm");

  // Create a conversation before confirm so checkout can link it.
  await send("Связаться с магазином");
  assert.equal(await mode(), "messages");
  await send("Вопрос по заказу");
  const conv = await db
    .selectFrom("communication_conversation")
    .selectAll()
    .where("business_id", "=", f.b.id)
    .where("external_user_id", "=", "4242")
    .executeTakeFirstOrThrow();

  await send("Корзина");
  await send("Оформить заказ");
  await send("Анна");
  await send("+79991234567");
  await send("Самовывоз");
  await send("/skip");
  await send("Подтвердить");
  assert.equal(await mode(), "menu");

  const order = await db
    .selectFrom("order")
    .selectAll()
    .where("business_id", "=", f.b.id)
    .executeTakeFirstOrThrow();
  assert.equal(order.customer_name, "Анна");
  assert.equal(order.fulfillment, "pickup");
  assert.equal(order.total, "700.00");
  assert.equal(order.conversation_id, conv.id);
  assert.equal(order.request_key, f.connection + ":" + event);

  const detail = await new (
    await import("../src/server/clients/service.ts")
  ).ClientService(db).detail(f.owner, f.b.public_id, order.client_id);
  assert.equal(detail.orders.length, 1);
  assert.equal(detail.orders[0].id, order.id);
});

test("sales alias activates orders menu", async () => {
  const f = await fixture();
  await db
    .deleteFrom("business_solution")
    .where("business_id", "=", f.b.id)
    .where("solution_code", "=", "orders")
    .execute();
  await db
    .insertInto("business_solution")
    .values({
      business_id: f.b.id,
      solution_code: "sales",
      status: "active",
    })
    .execute();
  let event = 1000;
  await db.transaction().execute((tx) =>
    routeBot(tx, {
      businessId: f.b.id,
      connectionId: f.connection,
      platform: "telegram",
      userId: "77",
      eventId: String(++event),
      text: "/start",
    }),
  );
  const out = await db
    .selectFrom("telegram_outbox")
    .select("buttons")
    .where("connection_id", "=", f.connection)
    .where("chat_id", "=", "77")
    .orderBy("created_at", "desc")
    .executeTakeFirstOrThrow();
  const buttons =
    typeof out.buttons === "string" ? JSON.parse(out.buttons) : out.buttons;
  assert.ok(Array.isArray(buttons) && buttons.includes("Каталог"));
  assert.ok(buttons.includes("Корзина"));
});
