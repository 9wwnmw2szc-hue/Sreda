import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { routeBot } from "../src/server/bot/router.ts";
import {
  getAvailableCustomerActions,
  assertCustomerActionAvailable,
} from "../src/server/solutions/customer-actions.ts";

const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

async function makeBusiness(name = "Biz") {
  const owner = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: owner,
      name: "Owner",
      email: owner + "@test.invalid",
      emailVerified: false,
      username: "u" + owner.replace(/-/g, "").slice(0, 16),
    })
    .execute();
  const b = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name,
      public_name: name,
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
  return { b, owner };
}

async function connect(businessId, platform) {
  const connection = randomUUID();
  await db
    .insertInto("business_connection")
    .values({
      id: connection,
      business_id: businessId,
      platform,
      status: "connected",
      external_account_id: randomUUID(),
      display_name: platform + "-bot",
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
    .insertInto(platform + "_runtime")
    .values({
      connection_id: connection,
      generation: randomUUID(),
      status: "ready",
    })
    .execute();
  return connection;
}

async function activate(businessId, codes) {
  for (const solution_code of codes) {
    await db
      .insertInto("business_solution")
      .values({
        business_id: businessId,
        solution_code,
        status: "active",
      })
      .onConflict((oc) =>
        oc.columns(["business_id", "solution_code"]).doUpdateSet({
          status: "active",
          expires_at: null,
        }),
      )
      .execute();
  }
}

async function addProduct(businessId) {
  const category = randomUUID();
  await db
    .insertInto("product_category")
    .values({
      id: category,
      business_id: businessId,
      name: "Чай",
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
      name: "Улун",
      description: "Чай",
      price: "100.00",
      currency: "RUB",
      active: true,
      position: 0,
      use_variants: false,
      track_inventory: false,
      availability: "in_stock",
    })
    .execute();
}

async function addService(businessId) {
  await db
    .insertInto("booking_service")
    .values({
      id: randomUUID(),
      business_id: businessId,
      name: "Стрижка",
      duration_minutes: 30,
      active: true,
    })
    .execute();
}

async function leadSetup(businessId, channels = ["telegram", "vk"]) {
  await db
    .insertInto("lead_setup")
    .values({
      business_id: businessId,
      draft: JSON.stringify({
        version: 1,
        step: 3,
        title: "Оставить заявку",
        channels,
        fields: ["name"],
      }),
    })
    .onConflict((oc) =>
      oc.column("business_id").doUpdateSet({
        draft: JSON.stringify({
          version: 1,
          step: 3,
          title: "Оставить заявку",
          channels,
          fields: ["name"],
        }),
      }),
    )
    .execute();
}

async function menuButtons(connectionId, platform) {
  const table = platform === "telegram" ? "telegram_outbox" : "vk_outbox";
  const row = await db
    .selectFrom(table)
    .select("buttons")
    .where("connection_id", "=", connectionId)
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  if (!row) return [];
  return typeof row.buttons === "string"
    ? JSON.parse(row.buttons)
    : row.buttons;
}

async function lastMessage(connectionId, platform) {
  const table = platform === "telegram" ? "telegram_outbox" : "vk_outbox";
  const row = await db
    .selectFrom(table)
    .select("message")
    .where("connection_id", "=", connectionId)
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  return row?.message ?? "";
}

let eventSeq = 1;
function nextEventId() {
  return String(eventSeq++);
}

test("orders only: customer sees catalog/cart, not booking or leads", async () => {
  const { b } = await makeBusiness("Orders Only");
  await activate(b.id, ["orders", "autopost"]);
  await addProduct(b.id);
  const tg = await connect(b.id, "telegram");
  const vk = await connect(b.id, "vk");

  for (const [platform, connection] of [
    ["telegram", tg],
    ["vk", vk],
  ]) {
    const available = await getAvailableCustomerActions(db, b.id, platform);
    assert.deepEqual(
      available.labels.sort(),
      ["Каталог", "Корзина", "Мои заказы", "Профиль"].sort(),
    );
    assert.equal(available.has("orders"), true);
    assert.equal(available.has("booking"), false);
    assert.equal(available.has("leads"), false);
    assert.equal(available.has("admin_messages"), false);
    assert.ok(!available.labels.includes("Записаться"));
    assert.ok(!available.labels.some((l) => /автопост|публик/i.test(l)));

    await db.transaction().execute((tx) =>
      routeBot(tx, {
        businessId: b.id,
        connectionId: connection,
        platform,
        userId: "u1",
        eventId: nextEventId(),
        text: "/start",
      }),
    );
    const buttons = await menuButtons(connection, platform);
    assert.deepEqual(
      buttons.sort(),
      ["Каталог", "Корзина", "Мои заказы", "Профиль"].sort(),
    );
  }
});

test("orders + booking ready → only those actions; TG and VK match", async () => {
  const { b } = await makeBusiness("Orders Booking");
  await activate(b.id, ["orders", "booking", "admin_messages"]);
  await addProduct(b.id);
  await addService(b.id);
  await connect(b.id, "telegram");
  await connect(b.id, "vk");

  const tgActions = await getAvailableCustomerActions(db, b.id, "telegram");
  const vkActions = await getAvailableCustomerActions(db, b.id, "vk");
  assert.deepEqual(tgActions.labels, vkActions.labels);
  assert.ok(tgActions.has("orders"));
  assert.ok(tgActions.has("booking"));
  assert.ok(tgActions.has("admin_messages"));
  assert.ok(tgActions.labels.includes("Связаться с администратором"));
  assert.ok(tgActions.labels.includes("Записаться"));
});

test("paused/disabled solution disappears; stale callback blocked", async () => {
  const { b } = await makeBusiness("Disable Orders");
  await activate(b.id, ["orders", "booking"]);
  await addProduct(b.id);
  await addService(b.id);
  const tg = await connect(b.id, "telegram");

  let available = await getAvailableCustomerActions(db, b.id, "telegram");
  assert.ok(available.has("orders"));

  await db
    .updateTable("business_solution")
    .set({ status: "disabled" })
    .where("business_id", "=", b.id)
    .where("solution_code", "=", "orders")
    .execute();

  available = await getAvailableCustomerActions(db, b.id, "telegram");
  assert.equal(available.has("orders"), false);
  assert.ok(available.has("booking"));
  assert.equal(
    await assertCustomerActionAvailable(db, b.id, "telegram", "orders"),
    false,
  );

  await db.transaction().execute((tx) =>
    routeBot(tx, {
      businessId: b.id,
      connectionId: tg,
      platform: "telegram",
      userId: "stale",
      eventId: nextEventId(),
      text: "/start",
    }),
  );
  await db.transaction().execute((tx) =>
    routeBot(tx, {
      businessId: b.id,
      connectionId: tg,
      platform: "telegram",
      userId: "stale",
      eventId: nextEventId(),
      text: "Каталог",
    }),
  );
  const msg = await lastMessage(tg, "telegram");
  assert.match(msg, /временно недоступна/i);
  const buttons = await menuButtons(tg, "telegram");
  assert.ok(!buttons.includes("Каталог"));
  assert.ok(buttons.includes("Записаться"));
});

test("setup_required orders (no products) omitted from menu", async () => {
  const { b } = await makeBusiness("No Products");
  await activate(b.id, ["orders"]);
  const tg = await connect(b.id, "telegram");
  const available = await getAvailableCustomerActions(db, b.id, "telegram");
  assert.equal(available.has("orders"), false);
  assert.deepEqual(available.labels, []);

  await db.transaction().execute((tx) =>
    routeBot(tx, {
      businessId: b.id,
      connectionId: tg,
      platform: "telegram",
      userId: "np",
      eventId: nextEventId(),
      text: "Каталог",
    }),
  );
  assert.match(await lastMessage(tg, "telegram"), /временно недоступна/i);
});

test("Business A and B have isolated customer menus", async () => {
  const a = await makeBusiness("Biz A");
  const b = await makeBusiness("Biz B");
  await activate(a.b.id, ["orders"]);
  await activate(b.b.id, ["booking", "admin_messages"]);
  await addProduct(a.b.id);
  await addService(b.b.id);
  await connect(a.b.id, "telegram");
  await connect(b.b.id, "telegram");

  const menuA = await getAvailableCustomerActions(db, a.b.id, "telegram");
  const menuB = await getAvailableCustomerActions(db, b.b.id, "telegram");
  assert.deepEqual(
    menuA.labels.sort(),
    ["Каталог", "Корзина", "Мои заказы", "Профиль"].sort(),
  );
  assert.ok(menuB.has("booking"));
  assert.ok(menuB.has("admin_messages"));
  assert.equal(menuB.has("orders"), false);
  assert.equal(menuA.has("booking"), false);
});

test("leads only when setup complete for the platform channel", async () => {
  const { b } = await makeBusiness("Leads TG only");
  await activate(b.id, ["leads"]);
  await leadSetup(b.id, ["telegram"]);
  await connect(b.id, "telegram");
  await connect(b.id, "vk");

  const tg = await getAvailableCustomerActions(db, b.id, "telegram");
  const vk = await getAvailableCustomerActions(db, b.id, "vk");
  assert.ok(tg.has("leads"));
  assert.equal(vk.has("leads"), false);
});

test("archived business yields empty customer actions", async () => {
  const { b } = await makeBusiness("Archived");
  await activate(b.id, ["orders", "booking"]);
  await addProduct(b.id);
  await connect(b.id, "telegram");
  await db
    .updateTable("business")
    .set({ archived_at: new Date() })
    .where("id", "=", b.id)
    .execute();
  const available = await getAvailableCustomerActions(db, b.id, "telegram");
  assert.deepEqual(available.labels, []);
});
