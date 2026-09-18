import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect, PostgresDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { migrate } from "../src/server/db/migrate.ts";
import { processEntityReminder } from "../src/server/calendar/worker.ts";
import { CalendarService } from "../src/server/calendar/service.ts";
import { queueBookingReminder } from "../src/server/booking/worker.ts";
import { queueNotification } from "../src/server/notifications/worker.ts";
import {
  queueScheduledPost,
  materializeRecurringPost,
} from "../src/server/posts/worker.ts";
import {
  CatalogService,
  OrderService,
} from "../src/server/orders/service.ts";
import { LeadService } from "../src/server/leads/service.ts";
import { expireClaims } from "../src/server/outbox/claim.ts";
import { encryptSecret } from "../src/server/connections/crypto.ts";

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
const secret = "hardening-fixture-secret-32chars!!";
const createdBusinessIds = [];

before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(async () => {
  // Remove fixture businesses and any pending outbox rows so shared CI Postgres
  // is not polluted for later test files that call deliverOne().
  for (const businessId of createdBusinessIds) {
    const conns = await db
      .selectFrom("business_connection")
      .select("id")
      .where("business_id", "=", businessId)
      .execute();
    for (const c of conns) {
      await db
        .deleteFrom("telegram_outbox")
        .where("connection_id", "=", c.id)
        .execute()
        .catch(() => {});
      await db
        .deleteFrom("vk_outbox")
        .where("connection_id", "=", c.id)
        .execute()
        .catch(() => {});
      await db
        .deleteFrom("telegram_runtime")
        .where("connection_id", "=", c.id)
        .execute()
        .catch(() => {});
      await db
        .deleteFrom("vk_runtime")
        .where("connection_id", "=", c.id)
        .execute()
        .catch(() => {});
      await db
        .deleteFrom("connection_secret")
        .where("connection_id", "=", c.id)
        .execute()
        .catch(() => {});
    }
    await db
      .deleteFrom("business_connection")
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

async function ownerBusiness(name = "Hardening") {
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
  return { uid, b };
}

async function connectTelegram(businessId, chatId = "1001") {
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
    .values({ connection_id: connectionId, generation: randomUUID(), status: "ready" })
    .execute();
  return { connectionId, chatId };
}

test("entity reminder stays failed when client telegram identity missing", async () => {
  const { uid, b } = await ownerBusiness("RemFail");
  const bookingId = randomUUID();
  const clientId = randomUUID();
  await db
    .insertInto("client")
    .values({
      id: clientId,
      business_id: b.id,
      name: "Client",
      phone: null,
      email: null,
    })
    .execute();
  // Minimal booking row via booking tables requires service/specialist — use calendar client path via booking entity reminder manually
  const service = await db
    .insertInto("booking_service")
    .values({
      id: randomUUID(),
      business_id: b.id,
      name: "Svc",
      duration_minutes: 60,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const specialist = await db
    .insertInto("booking_specialist")
    .values({
      id: randomUUID(),
      business_id: b.id,
      name: "Spec",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const starts = new Date(Date.now() + 2 * 3600000);
  const ends = new Date(+starts + 3600000);
  await db
    .insertInto("booking")
    .values({
      id: bookingId,
      business_id: b.id,
      service_id: service.id,
      specialist_id: specialist.id,
      client_id: clientId,
      starts_at: starts,
      ends_at: ends,
      occupied_from: starts,
      occupied_until: ends,
      status: "confirmed",
      revision: 1,
      source: "manual",
      request_key: randomUUID(),
      request_hash: randomUUID().replace(/-/g, ""),
    })
    .execute();
  const reminderId = randomUUID();
  await db
    .insertInto("entity_reminder")
    .values({
      id: reminderId,
      business_id: b.id,
      entity_kind: "booking",
      entity_id: bookingId,
      offset_minutes: 60,
      fire_at: new Date(Date.now() - 1000),
      audience: "client",
      channel: "telegram",
      status: "pending",
      recipient_user_id: null,
      message_template: "",
      last_error: null,
    })
    .execute();
  assert.equal(await processEntityReminder(db), true);
  const row = await db
    .selectFrom("entity_reminder")
    .select(["status", "last_error"])
    .where("id", "=", reminderId)
    .executeTakeFirstOrThrow();
  assert.equal(row.status, "failed");
  assert.equal(row.last_error, "NO_READY_CLIENT_TELEGRAM");
  const outbox = await db
    .selectFrom("telegram_outbox")
    .select("id")
    .where("entity_reminder_id", "=", reminderId)
    .execute();
  assert.equal(outbox.length, 0);
  void uid;
});

test("entity reminder queues to outbox and does not mark sent until delivery", async () => {
  const { b } = await ownerBusiness("RemQueue");
  const { connectionId } = await connectTelegram(b.id);
  const clientId = randomUUID();
  await db
    .insertInto("client")
    .values({
      id: clientId,
      business_id: b.id,
      name: "Client",
      phone: null,
      email: null,
    })
    .execute();
  await db
    .insertInto("client_identity")
    .values({
      business_id: b.id,
      client_id: clientId,
      kind: "telegram",
      value: "777",
      username: null,
    })
    .execute();
  const service = await db
    .insertInto("booking_service")
    .values({
      id: randomUUID(),
      business_id: b.id,
      name: "Svc",
      duration_minutes: 60,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const specialist = await db
    .insertInto("booking_specialist")
    .values({
      id: randomUUID(),
      business_id: b.id,
      name: "Spec",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const bookingId = randomUUID();
  const starts = new Date(Date.now() + 3 * 3600000);
  const ends = new Date(+starts + 3600000);
  await db
    .insertInto("booking")
    .values({
      id: bookingId,
      business_id: b.id,
      service_id: service.id,
      specialist_id: specialist.id,
      client_id: clientId,
      starts_at: starts,
      ends_at: ends,
      occupied_from: starts,
      occupied_until: ends,
      status: "confirmed",
      revision: 1,
      source: "manual",
      request_key: randomUUID(),
      request_hash: randomUUID().replace(/-/g, ""),
    })
    .execute();
  const reminderId = randomUUID();
  await db
    .insertInto("entity_reminder")
    .values({
      id: reminderId,
      business_id: b.id,
      entity_kind: "booking",
      entity_id: bookingId,
      offset_minutes: 30,
      fire_at: new Date(Date.now() - 1000),
      audience: "client",
      channel: "telegram",
      status: "pending",
      recipient_user_id: null,
      message_template: "soon",
      last_error: null,
    })
    .execute();
  assert.equal(await processEntityReminder(db), true);
  const row = await db
    .selectFrom("entity_reminder")
    .select("status")
    .where("id", "=", reminderId)
    .executeTakeFirstOrThrow();
  assert.equal(row.status, "queued");
  const outbox = await db
    .selectFrom("telegram_outbox")
    .selectAll()
    .where("entity_reminder_id", "=", reminderId)
    .executeTakeFirstOrThrow();
  assert.equal(outbox.connection_id, connectionId);
  assert.equal(outbox.chat_id, "777");
  // restart/idempotency: second process does nothing (already queued)
  assert.equal(await processEntityReminder(db), false);
  // Do not leave pending outbox for other test files on shared Postgres.
  await db
    .deleteFrom("telegram_outbox")
    .where("entity_reminder_id", "=", reminderId)
    .execute();
  await db
    .updateTable("telegram_runtime")
    .set({ status: "error", updated_at: new Date() })
    .where("connection_id", "=", connectionId)
    .execute();
});

test("VK staff reminder fails gracefully without outbox or sent", async () => {
  const { uid, b } = await ownerBusiness("VkStaff");
  const cal = new CalendarService(db);
  const starts = new Date(Date.now() + 4 * 3600000);
  const event = await cal.create(uid, b.public_id, {
    title: "Task",
    event_type: "task",
    starts_at: starts.toISOString(),
    ends_at: new Date(+starts + 3600000).toISOString(),
  });
  const reminderId = randomUUID();
  await db
    .insertInto("entity_reminder")
    .values({
      id: reminderId,
      business_id: b.id,
      entity_kind: "calendar_event",
      entity_id: event.id,
      offset_minutes: 15,
      fire_at: new Date(Date.now() - 500),
      audience: "staff",
      channel: "vk",
      status: "pending",
      recipient_user_id: uid,
      message_template: "",
      last_error: null,
    })
    .execute();
  assert.equal(await processEntityReminder(db), true);
  const row = await db
    .selectFrom("entity_reminder")
    .select(["status", "last_error"])
    .where("id", "=", reminderId)
    .executeTakeFirstOrThrow();
  assert.equal(row.status, "failed");
  assert.equal(row.last_error, "NO_READY_STAFF_VK_BINDING");
  assert.equal(
    (
      await db
        .selectFrom("vk_outbox")
        .select("id")
        .where("entity_reminder_id", "=", reminderId)
        .execute()
    ).length,
    0,
  );
});

test("dual worker loops claim the same entity reminder once", async () => {
  const { uid, b } = await ownerBusiness("DualRem");
  const starts = new Date(Date.now() + 5 * 3600000);
  const event = await new CalendarService(db).create(uid, b.public_id, {
    title: "Dual",
    event_type: "note",
    starts_at: starts.toISOString(),
    ends_at: new Date(+starts + 3600000).toISOString(),
  });
  const reminderId = randomUUID();
  await db
    .insertInto("entity_reminder")
    .values({
      id: reminderId,
      business_id: b.id,
      entity_kind: "calendar_event",
      entity_id: event.id,
      offset_minutes: 10,
      fire_at: new Date(Date.now() - 100),
      audience: "staff",
      channel: "in_app",
      status: "pending",
      recipient_user_id: uid,
      message_template: "",
      last_error: null,
    })
    .execute();
  const [a, c] = await Promise.all([
    processEntityReminder(db),
    processEntityReminder(db),
  ]);
  assert.equal(Number(a) + Number(c), 1);
  const row = await db
    .selectFrom("entity_reminder")
    .select("status")
    .where("id", "=", reminderId)
    .executeTakeFirstOrThrow();
  assert.equal(row.status, "sent");
  const notifications = await db
    .selectFrom("notification")
    .select("id")
    .where("business_id", "=", b.id)
    .where("event_key", "=", "entity-reminder:" + reminderId)
    .execute();
  assert.equal(notifications.length, 1);
});

test("dual worker shared scheduled functions are claim-safe", async () => {
  // Smoke the claim paths concurrently; they should not throw and should return boolean.
  const results = await Promise.all([
    queueNotification(db, "https://example.test"),
    queueNotification(db, "https://example.test"),
    materializeRecurringPost(db),
    materializeRecurringPost(db),
    queueScheduledPost(db),
    queueScheduledPost(db),
    queueBookingReminder(db),
    queueBookingReminder(db),
    processEntityReminder(db),
    processEntityReminder(db),
  ]);
  assert.ok(results.every((r) => typeof r === "boolean"));
});

test("order cancel restores inventory exactly once for product and variant", async () => {
  const { uid, b } = await ownerBusiness("InvRestore");
  await db
    .insertInto("business_solution")
    .values({
      business_id: b.id,
      solution_code: "orders",
      status: "active",
      starts_at: new Date(),
      expires_at: null,
    })
    .execute();
  const catalog = new CatalogService(db);
  const orders = new OrderService(db);
  const product = await catalog.saveProduct(uid, b.public_id, {
    name: "Tea",
    price: "100",
    track_inventory: true,
    availability: "quantity",
    stock_quantity: 5,
    active: true,
  });
  const variantProduct = await catalog.saveProduct(uid, b.public_id, {
    name: "Shirt",
    price: "200",
    use_variants: true,
    track_inventory: true,
    availability: "quantity",
    stock_quantity: 0,
    active: true,
    variants: [
      {
        label: "M",
        availability: "quantity",
        stock_quantity: 3,
        active: true,
      },
    ],
  });
  const variantId = (
    await catalog.getProduct(uid, b.public_id, variantProduct.id)
  ).variants[0].id;
  const order = await orders.checkout(b.id, {
    platform: "web",
    external_user_id: "buyer-" + randomUUID().slice(0, 8),
    customer_name: "Buyer",
    customer_phone: "+79990001122",
    fulfillment: "pickup",
    request_key: "rk-" + randomUUID(),
    cart_items: [
      { product_id: product.id, quantity: 2 },
      { product_id: variantProduct.id, variant_id: variantId, quantity: 1 },
    ],
  });
  const afterCheckout = await catalog.getProduct(uid, b.public_id, product.id);
  assert.equal(afterCheckout.stock_quantity, 3);
  const afterVariant = await catalog.getProduct(
    uid,
    b.public_id,
    variantProduct.id,
  );
  assert.equal(afterVariant.variants[0].stock_quantity, 2);

  await orders.transitionStatus(uid, b.public_id, order.id, {
    status: "cancelled",
  });
  const restored = await catalog.getProduct(uid, b.public_id, product.id);
  assert.equal(restored.stock_quantity, 5);
  const restoredVariant = await catalog.getProduct(
    uid,
    b.public_id,
    variantProduct.id,
  );
  assert.equal(restoredVariant.variants[0].stock_quantity, 3);
  const orderRow = await db
    .selectFrom("order")
    .select("inventory_restored_at")
    .where("id", "=", order.id)
    .executeTakeFirstOrThrow();
  assert.ok(orderRow.inventory_restored_at);

  // Second cancel rejected; stock unchanged
  await assert.rejects(
    orders.transitionStatus(uid, b.public_id, order.id, { status: "cancelled" }),
    (e) => e.code === "INVALID_STATUS_TRANSITION",
  );
  assert.equal(
    (await catalog.getProduct(uid, b.public_id, product.id)).stock_quantity,
    5,
  );
});

test("mixed currency checkout is rejected", async () => {
  const { uid, b } = await ownerBusiness("Currency");
  await db
    .insertInto("business_solution")
    .values({
      business_id: b.id,
      solution_code: "orders",
      status: "active",
      starts_at: new Date(),
      expires_at: null,
    })
    .execute();
  const catalog = new CatalogService(db);
  const orders = new OrderService(db);
  const rub = await catalog.saveProduct(uid, b.public_id, {
    name: "RUB item",
    price: "100",
    currency: "RUB",
    active: true,
  });
  const usd = await catalog.saveProduct(uid, b.public_id, {
    name: "USD item",
    price: "10",
    currency: "USD",
    active: true,
  });
  await assert.rejects(
    orders.checkout(b.id, {
      platform: "web",
      external_user_id: "buyer-currency",
      customer_name: "Buyer",
      customer_phone: "+79990001122",
      fulfillment: "pickup",
      request_key: "rk-" + randomUUID(),
      cart_items: [
        { product_id: rub.id, quantity: 1 },
        { product_id: usd.id, quantity: 1 },
      ],
    }),
    (e) => e.code === "MIXED_CURRENCY",
  );
});

test("calendar assigned_to and reminder recipient must be active members", async () => {
  const a = await ownerBusiness("CalA");
  const other = await ownerBusiness("CalB");
  const cal = new CalendarService(db);
  const starts = new Date(Date.now() + 6 * 3600000).toISOString();
  const ends = new Date(Date.now() + 7 * 3600000).toISOString();
  await assert.rejects(
    cal.create(a.uid, a.b.public_id, {
      title: "Bad assign",
      event_type: "task",
      starts_at: starts,
      ends_at: ends,
      assigned_to: other.uid,
    }),
    (e) => e.code === "INVALID_ASSIGNEE",
  );
  const event = await cal.create(a.uid, a.b.public_id, {
    title: "Ok",
    event_type: "task",
    starts_at: starts,
    ends_at: ends,
    assigned_to: a.uid,
  });
  assert.equal(event.assigned_to, a.uid);
  await assert.rejects(
    cal.scheduleEntityReminders(a.uid, a.b.public_id, {
      entity_kind: "calendar_event",
      entity_id: event.id,
      starts_at: starts,
      offsets: [15],
      recipient_user_id: other.uid,
    }),
    (e) => e.code === "INVALID_ASSIGNEE",
  );
});

test("product variant option_ids must belong to the product", async () => {
  const { uid, b } = await ownerBusiness("Opts");
  await db
    .insertInto("business_solution")
    .values({
      business_id: b.id,
      solution_code: "orders",
      status: "active",
      starts_at: new Date(),
      expires_at: null,
    })
    .execute();
  const catalog = new CatalogService(db);
  const product = await catalog.saveProduct(uid, b.public_id, {
    name: "With options",
    price: "50",
    use_variants: true,
    active: true,
  });
  const groupId = randomUUID();
  const optionId = randomUUID();
  await db
    .insertInto("product_option_group")
    .values({
      id: groupId,
      business_id: b.id,
      product_id: product.id,
      name: "Size",
      position: 0,
    })
    .execute();
  await db
    .insertInto("product_option")
    .values({
      id: optionId,
      business_id: b.id,
      group_id: groupId,
      name: "M",
      position: 0,
    })
    .execute();
  const otherProduct = await catalog.saveProduct(uid, b.public_id, {
    name: "Other",
    price: "10",
    active: true,
  });
  const foreignGroup = randomUUID();
  const foreignOption = randomUUID();
  await db
    .insertInto("product_option_group")
    .values({
      id: foreignGroup,
      business_id: b.id,
      product_id: otherProduct.id,
      name: "Color",
      position: 0,
    })
    .execute();
  await db
    .insertInto("product_option")
    .values({
      id: foreignOption,
      business_id: b.id,
      group_id: foreignGroup,
      name: "Red",
      position: 0,
    })
    .execute();

  await assert.rejects(
    catalog.saveProduct(
      uid,
      b.public_id,
      {
        name: "With options",
        price: "50",
        use_variants: true,
        active: true,
        variants: [
          {
            label: "Bad",
            option_ids: [foreignOption],
            availability: "in_stock",
            active: true,
          },
        ],
      },
      product.id,
    ),
    (e) => e.code === "INVALID_ORDER",
  );

  const ok = await catalog.saveProduct(
    uid,
    b.public_id,
    {
      name: "With options",
      price: "50",
      use_variants: true,
      active: true,
      variants: [
        {
          label: "M",
          option_ids: [optionId],
          availability: "in_stock",
          active: true,
        },
      ],
    },
    product.id,
  );
  const detail = await catalog.getProduct(uid, b.public_id, ok.id);
  assert.equal(detail.variants.length, 1);
});

test(
  "concurrent cart add of null-variant product yields one row",
  { skip: !usePg && "Requires PostgreSQL NULL uniqueness semantics" },
  async () => {
    const { uid, b } = await ownerBusiness("CartRace");
    await db
      .insertInto("business_solution")
      .values({
        business_id: b.id,
        solution_code: "orders",
        status: "active",
        starts_at: new Date(),
        expires_at: null,
      })
      .execute();
    const catalog = new CatalogService(db);
    const orders = new OrderService(db);
    const product = await catalog.saveProduct(uid, b.public_id, {
      name: "Plain",
      price: "10",
      active: true,
      track_inventory: true,
      availability: "quantity",
      stock_quantity: 100,
    });
    const buyer = "race-" + randomUUID().slice(0, 8);
    await Promise.all([
      orders.addCartItem(b.id, "web", buyer, {
        product_id: product.id,
        quantity: 1,
      }),
      orders.addCartItem(b.id, "web", buyer, {
        product_id: product.id,
        quantity: 1,
      }),
      orders.addCartItem(b.id, "web", buyer, {
        product_id: product.id,
        quantity: 1,
      }),
    ]);
    const items = await db
      .selectFrom("cart_item as i")
      .innerJoin("cart as c", "c.id", "i.cart_id")
      .select(["i.id", "i.quantity"])
      .where("c.business_id", "=", b.id)
      .where("c.external_user_id", "=", buyer)
      .where("i.product_id", "=", product.id)
      .execute();
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity, 3);
  },
);

test("cart_item unique indexes reject duplicate null-variant rows", async () => {
  const { b } = await ownerBusiness("CartUnique");
  const productId = randomUUID();
  const cartId = randomUUID();
  await db
    .insertInto("product")
    .values({
      id: productId,
      business_id: b.id,
      name: "Plain",
      price: "10",
      currency: "RUB",
    })
    .execute();
  await db
    .insertInto("cart")
    .values({
      id: cartId,
      business_id: b.id,
      platform: "web",
      external_user_id: "unique-" + randomUUID().slice(0, 8),
    })
    .execute();
  await db
    .insertInto("cart_item")
    .values({
      id: randomUUID(),
      business_id: b.id,
      cart_id: cartId,
      product_id: productId,
      variant_id: null,
      quantity: 1,
    })
    .execute();
  await assert.rejects(
    db
      .insertInto("cart_item")
      .values({
        id: randomUUID(),
        business_id: b.id,
        cart_id: cartId,
        product_id: productId,
        variant_id: null,
        quantity: 2,
      })
      .execute(),
  );
});


test("partial product PATCH preserves inventory fields", async () => {
  const { uid, b } = await ownerBusiness("PatchInv");
  await db
    .insertInto("business_solution")
    .values({
      business_id: b.id,
      solution_code: "orders",
      status: "active",
      starts_at: new Date(),
      expires_at: null,
    })
    .execute();
  const catalog = new CatalogService(db);
  const product = await catalog.saveProduct(uid, b.public_id, {
    name: "Tea",
    price: "100",
    track_inventory: true,
    availability: "quantity",
    stock_quantity: 7,
    active: true,
  });
  await catalog.saveProduct(
    uid,
    b.public_id,
    { name: "Tea", price: "100", active: false },
    product.id,
  );
  const after = await catalog.getProduct(uid, b.public_id, product.id);
  assert.equal(after.active, false);
  assert.equal(after.track_inventory, true);
  assert.equal(after.availability, "quantity");
  assert.equal(after.stock_quantity, 7);
});

test("cancel restores stock after catalog track_inventory was turned off", async () => {
  const { uid, b } = await ownerBusiness("RestoreFlag");
  await db
    .insertInto("business_solution")
    .values({
      business_id: b.id,
      solution_code: "orders",
      status: "active",
      starts_at: new Date(),
      expires_at: null,
    })
    .execute();
  const catalog = new CatalogService(db);
  const orders = new OrderService(db);
  const product = await catalog.saveProduct(uid, b.public_id, {
    name: "Tea",
    price: "100",
    track_inventory: true,
    availability: "quantity",
    stock_quantity: 4,
    active: true,
  });
  const order = await orders.checkout(b.id, {
    platform: "web",
    external_user_id: "buyer-" + randomUUID().slice(0, 8),
    customer_name: "Buyer",
    customer_phone: "+79990001133",
    fulfillment: "pickup",
    request_key: "rk-" + randomUUID(),
    cart_items: [{ product_id: product.id, quantity: 2 }],
  });
  assert.equal(
    (await catalog.getProduct(uid, b.public_id, product.id)).stock_quantity,
    2,
  );
  const deducted = await db
    .selectFrom("order_item")
    .select("stock_deducted")
    .where("order_id", "=", order.id)
    .executeTakeFirstOrThrow();
  assert.equal(deducted.stock_deducted, true);

  await catalog.saveProduct(
    uid,
    b.public_id,
    {
      name: "Tea",
      price: "100",
      track_inventory: false,
    },
    product.id,
  );
  const mid = await catalog.getProduct(uid, b.public_id, product.id);
  assert.equal(mid.track_inventory, false);
  assert.equal(mid.availability, "quantity");
  assert.equal(mid.stock_quantity, 2);
  await orders.transitionStatus(uid, b.public_id, order.id, {
    status: "cancelled",
  });
  const restored = await catalog.getProduct(uid, b.public_id, product.id);
  assert.equal(restored.track_inventory, true);
  assert.equal(restored.availability, "quantity");
  assert.equal(restored.stock_quantity, 4);
});

test("variant checkout rejects when use_variants was disabled", async () => {
  const { uid, b } = await ownerBusiness("UseVar");
  await db
    .insertInto("business_solution")
    .values({
      business_id: b.id,
      solution_code: "orders",
      status: "active",
      starts_at: new Date(),
      expires_at: null,
    })
    .execute();
  const catalog = new CatalogService(db);
  const orders = new OrderService(db);
  const product = await catalog.saveProduct(uid, b.public_id, {
    name: "Shirt",
    price: "200",
    use_variants: true,
    track_inventory: true,
    availability: "quantity",
    stock_quantity: 0,
    active: true,
    variants: [
      { label: "M", availability: "quantity", stock_quantity: 2, active: true },
    ],
  });
  const variantId = (
    await catalog.getProduct(uid, b.public_id, product.id)
  ).variants[0].id;
  await catalog.saveProduct(
    uid,
    b.public_id,
    { name: "Shirt", price: "200", use_variants: false },
    product.id,
  );
  await assert.rejects(
    orders.checkout(b.id, {
      platform: "web",
      external_user_id: "buyer-" + randomUUID().slice(0, 8),
      customer_name: "Buyer",
      customer_phone: "+79990001144",
      fulfillment: "pickup",
      request_key: "rk-" + randomUUID(),
      cart_items: [
        { product_id: product.id, variant_id: variantId, quantity: 1 },
      ],
    }),
    (e) => e.code === "INVALID_ORDER" || /вариант/i.test(e.message),
  );
});

test("duplicate variant option combinations are rejected", async () => {
  const { uid, b } = await ownerBusiness("DupCombo");
  await db
    .insertInto("business_solution")
    .values({
      business_id: b.id,
      solution_code: "orders",
      status: "active",
      starts_at: new Date(),
      expires_at: null,
    })
    .execute();
  const catalog = new CatalogService(db);
  const product = await catalog.saveProduct(uid, b.public_id, {
    name: "Mug",
    price: "50",
    use_variants: true,
    active: true,
  });
  const groupId = randomUUID();
  const optA = randomUUID();
  const optB = randomUUID();
  await db
    .insertInto("product_option_group")
    .values({
      id: groupId,
      business_id: b.id,
      product_id: product.id,
      name: "Size",
      position: 0,
    })
    .execute();
  await db
    .insertInto("product_option")
    .values([
      { id: optA, business_id: b.id, group_id: groupId, name: "S", position: 0 },
      { id: optB, business_id: b.id, group_id: groupId, name: "M", position: 1 },
    ])
    .execute();
  await assert.rejects(
    catalog.saveProduct(
      uid,
      b.public_id,
      {
        name: "Mug",
        price: "50",
        use_variants: true,
        variants: [
          { label: "S1", option_ids: [optA], availability: "in_stock" },
          { label: "S2", option_ids: [optA], availability: "in_stock" },
        ],
      },
      product.id,
    ),
    (e) => /одинаков/i.test(e.message) || e.code === "INVALID_ORDER",
  );
});

test(
  "two staff cannot concurrently take the same lead",
  { skip: !usePg && "Requires PostgreSQL row locks" },
  async () => {
  const { uid, b } = await ownerBusiness("LeadRace");
  const opA = randomUUID();
  const opB = randomUUID();
  for (const id of [opA, opB]) {
    await db
      .insertInto("user")
      .values({
        id,
        name: "Op",
        email: id + "@test.invalid",
        emailVerified: false,
        username: "u" + id.replace(/-/g, "").slice(0, 20),
      })
      .execute();
    await db
      .insertInto("business_member")
      .values({
        business_id: b.id,
        user_id: id,
        role: "operator",
        status: "active",
      })
      .execute();
  }
  await db
    .insertInto("business_solution")
    .values({
      business_id: b.id,
      solution_code: "leads",
      status: "active",
      starts_at: new Date(),
      expires_at: null,
    })
    .execute();
  const leads = new LeadService(db);
  const lead = await leads.create(uid, b.public_id, {
    source: "telegram",
    name: "Клиент",
  });
  const results = await Promise.allSettled([
    leads.updateStatus(opA, b.public_id, lead.id, "processing"),
    leads.updateStatus(opB, b.public_id, lead.id, "processing"),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled");
  const fail = results.filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(fail.length, 1);
  assert.equal(fail[0].reason.code, "LEAD_ASSIGNED");
  const row = await db
    .selectFrom("lead")
    .select("processing_by")
    .where("id", "=", lead.id)
    .executeTakeFirstOrThrow();
  assert.ok(row.processing_by === opA || row.processing_by === opB);
});

test("expireClaims marks entity_reminder uncertain when outbox lease expires", async () => {
  const { b } = await ownerBusiness("ExpireEnt");
  const { connectionId } = await connectTelegram(b.id);
  const reminderId = randomUUID();
  await db
    .insertInto("entity_reminder")
    .values({
      id: reminderId,
      business_id: b.id,
      entity_kind: "calendar_event",
      entity_id: randomUUID(),
      offset_minutes: 30,
      fire_at: new Date(Date.now() - 1000),
      audience: "staff",
      channel: "telegram",
      status: "queued",
      recipient_user_id: null,
      message_template: "",
      last_error: null,
    })
    .execute();
  await db
    .insertInto("telegram_outbox")
    .values({
      connection_id: connectionId,
      chat_id: "1001",
      message: "reminder",
      delivery_state: "sending",
      claimed_at: new Date(Date.now() - 400000),
      entity_reminder_id: reminderId,
      available_at: new Date(Date.now() - 400000),
    })
    .execute();
  await expireClaims(db, "telegram");
  const row = await db
    .selectFrom("entity_reminder")
    .select(["status", "last_error"])
    .where("id", "=", reminderId)
    .executeTakeFirstOrThrow();
  assert.equal(row.status, "uncertain");
  assert.equal(row.last_error, "DELIVERY_UNKNOWN");
});

test("VK staff reminder queues when binding and runtime are ready", async () => {
  const { uid, b } = await ownerBusiness("VkStaffOk");
  const connectionId = randomUUID();
  await db
    .insertInto("business_connection")
    .values({
      id: connectionId,
      business_id: b.id,
      platform: "vk",
      external_account_id: randomUUID(),
      display_name: "vk",
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
    .insertInto("vk_runtime")
    .values({
      connection_id: connectionId,
      generation: randomUUID(),
      status: "ready",
    })
    .execute();
  await db
    .insertInto("notification_binding")
    .values({
      business_id: b.id,
      user_id: uid,
      platform: "vk",
      connection_id: connectionId,
      chat_id: "2001",
      code_hash: null,
      expires_at: null,
    })
    .execute();
  const starts = new Date(Date.now() + 3 * 3600000);
  const event = await new CalendarService(db).create(uid, b.public_id, {
    title: "VK task",
    event_type: "task",
    starts_at: starts.toISOString(),
    ends_at: new Date(+starts + 3600000).toISOString(),
  });
  const reminderId = randomUUID();
  await db
    .insertInto("entity_reminder")
    .values({
      id: reminderId,
      business_id: b.id,
      entity_kind: "calendar_event",
      entity_id: event.id,
      offset_minutes: 15,
      fire_at: new Date(Date.now() - 500),
      audience: "staff",
      channel: "vk",
      status: "pending",
      recipient_user_id: uid,
      message_template: "",
      last_error: null,
    })
    .execute();
  assert.equal(await processEntityReminder(db), true);
  const row = await db
    .selectFrom("entity_reminder")
    .select("status")
    .where("id", "=", reminderId)
    .executeTakeFirstOrThrow();
  assert.equal(row.status, "queued");
  assert.equal(
    (
      await db
        .selectFrom("vk_outbox")
        .select("id")
        .where("entity_reminder_id", "=", reminderId)
        .execute()
    ).length,
    1,
  );
});

test("order numbers are sequential and concurrency-safe", async () => {
  const { uid, b } = await ownerBusiness("OrderNum");
  await db
    .insertInto("business_solution")
    .values({
      business_id: b.id,
      solution_code: "orders",
      status: "active",
      starts_at: new Date(),
      expires_at: null,
    })
    .execute();
  const catalog = new CatalogService(db);
  const orders = new OrderService(db);
  const product = await catalog.saveProduct(uid, b.public_id, {
    name: "Item",
    price: "10",
    active: true,
  });
  const make = (i) =>
    orders.checkout(b.id, {
      platform: "web",
      external_user_id: "num-" + i + "-" + randomUUID().slice(0, 6),
      customer_name: "Buyer",
      customer_phone: "+7999000" + String(1000 + i),
      fulfillment: "pickup",
      request_key: "rk-num-" + randomUUID(),
      cart_items: [{ product_id: product.id, quantity: 1 }],
    });
  const created = await Promise.all([make(1), make(2), make(3), make(4)]);
  const numbers = created.map((o) => o.order_number).sort((a, b) => a - b);
  assert.deepEqual(numbers, [1001, 1002, 1003, 1004]);
  assert.equal(new Set(numbers).size, 4);
});

test("solution visual codes are distinct for orders and admin_messages", async () => {
  const { solutionVisualCode, solutionModuleAsset } = await import(
    "../src/config/solutionPresentation.ts"
  );
  assert.equal(solutionVisualCode("orders"), "orders");
  assert.equal(solutionVisualCode("admin_messages"), "messages");
  assert.notEqual(
    solutionModuleAsset("orders"),
    solutionModuleAsset("admin_messages"),
  );
  assert.match(solutionModuleAsset("orders"), /module-orders\.webp$/);
  assert.match(
    solutionModuleAsset("admin_messages"),
    /module-messages\.webp$/,
  );
});
