import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import {
  CatalogService,
  OrderService,
} from "../src/server/orders/service.ts";

const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

async function fixture(name = "Shop") {
  const uid = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: uid,
      name: "Owner",
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
  await db
    .insertInto("business_solution")
    .values({
      business_id: b.id,
      solution_code: "orders",
      status: "active",
    })
    .execute();
  return {
    uid,
    b,
    catalog: new CatalogService(db),
    orders: new OrderService(db),
  };
}

function checkoutBody(overrides = {}) {
  return {
    platform: "web",
    external_user_id: "buyer-" + randomUUID().slice(0, 8),
    customer_name: "Иван",
    customer_phone: "+79991234567",
    fulfillment: "pickup",
    request_key: "rk-" + randomUUID(),
    ...overrides,
  };
}

test("category and product create", async () => {
  const f = await fixture();
  const category = await f.catalog.saveCategory(f.uid, f.b.public_id, {
    name: "Чай",
    description: "Листовой",
  });
  assert.ok(category.id);
  const product = await f.catalog.saveProduct(f.uid, f.b.public_id, {
    name: "Улун",
    price: "450",
    description: "Тайвань",
    category_id: category.id,
    active: true,
  });
  assert.ok(product.id);
  const categories = await f.catalog.listCategories(f.uid, f.b.public_id);
  assert.equal(categories.length, 1);
  assert.equal(categories[0].name, "Чай");
  const products = await f.catalog.listProducts(f.uid, f.b.public_id);
  assert.equal(products.length, 1);
  assert.equal(products[0].name, "Улун");
  assert.equal(products[0].category_id, category.id);
  assert.equal(products[0].price, "450.00");
});

test("variants inventory quantity decrements on checkout", async () => {
  const f = await fixture();
  const product = await f.catalog.saveProduct(f.uid, f.b.public_id, {
    name: "Футболка",
    price: "1200",
    use_variants: true,
    track_inventory: true,
    availability: "quantity",
    stock_quantity: 0,
    variants: [
      {
        label: "M",
        availability: "quantity",
        stock_quantity: 5,
        active: true,
      },
    ],
  });
  const detail = await f.catalog.getProduct(f.uid, f.b.public_id, product.id);
  assert.equal(detail.variants.length, 1);
  const variantId = detail.variants[0].id;
  const order = await f.orders.checkout(
    f.b.id,
    checkoutBody({
      cart_items: [
        { product_id: product.id, variant_id: variantId, quantity: 2 },
      ],
    }),
    f.uid,
  );
  assert.equal(order.status, "new");
  const after = await f.catalog.getProduct(f.uid, f.b.public_id, product.id);
  assert.equal(after.variants[0].stock_quantity, 3);
});

test("concurrent stock decrement: one fails or stock never negative", async () => {
  const f = await fixture();
  const product = await f.catalog.saveProduct(f.uid, f.b.public_id, {
    name: "Лимит",
    price: "100",
    track_inventory: true,
    availability: "quantity",
    stock_quantity: 1,
  });
  const results = await Promise.allSettled([
    f.orders.checkout(
      f.b.id,
      checkoutBody({
        external_user_id: "race-a",
        cart_items: [{ product_id: product.id, quantity: 1 }],
      }),
      f.uid,
    ),
    f.orders.checkout(
      f.b.id,
      checkoutBody({
        external_user_id: "race-b",
        cart_items: [{ product_id: product.id, quantity: 1 }],
      }),
      f.uid,
    ),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.ok(fulfilled.length >= 1);
  if (rejected.length) {
    assert.equal(rejected[0].reason.code, "OUT_OF_STOCK");
  }
  const stock = await db
    .selectFrom("product")
    .select("stock_quantity")
    .where("id", "=", product.id)
    .executeTakeFirstOrThrow();
  assert.ok((stock.stock_quantity ?? 0) >= 0);
  assert.ok((stock.stock_quantity ?? 0) <= 1);
  if (fulfilled.length === 2) {
    assert.equal(stock.stock_quantity, 0);
  } else {
    assert.equal(fulfilled.length, 1);
    assert.equal(stock.stock_quantity, 0);
  }
});

test("cart add update remove clear", async () => {
  const f = await fixture();
  const product = await f.catalog.saveProduct(f.uid, f.b.public_id, {
    name: "Кружка",
    price: "300",
    availability: "in_stock",
  });
  const platform = "telegram";
  const user = "tg-" + randomUUID().slice(0, 8);
  let cart = await f.orders.addCartItem(f.b.id, platform, user, {
    product_id: product.id,
    quantity: 1,
  });
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].quantity, 1);
  const itemId = cart.items[0].id;
  cart = await f.orders.updateCartItem(f.b.id, platform, user, itemId, 3);
  assert.equal(cart.items[0].quantity, 3);
  cart = await f.orders.removeCartItem(f.b.id, platform, user, itemId);
  assert.equal(cart.items.length, 0);
  cart = await f.orders.addCartItem(f.b.id, platform, user, {
    product_id: product.id,
    quantity: 2,
  });
  assert.equal(cart.items.length, 1);
  cart = await f.orders.clearCart(f.b.id, platform, user);
  assert.equal(cart.items.length, 0);
});

test("checkout idempotency with same request_key", async () => {
  const f = await fixture();
  const product = await f.catalog.saveProduct(f.uid, f.b.public_id, {
    name: "Свеча",
    price: "500",
    track_inventory: true,
    availability: "quantity",
    stock_quantity: 10,
  });
  const key = "idem-" + randomUUID();
  const body = checkoutBody({
    request_key: key,
    cart_items: [{ product_id: product.id, quantity: 1 }],
  });
  const first = await f.orders.checkout(f.b.id, body, f.uid);
  const second = await f.orders.checkout(f.b.id, body, f.uid);
  assert.equal(first.id, second.id);
  const stock = await db
    .selectFrom("product")
    .select("stock_quantity")
    .where("id", "=", product.id)
    .executeTakeFirstOrThrow();
  assert.equal(stock.stock_quantity, 9);
  await assert.rejects(
    () =>
      f.orders.checkout(
        f.b.id,
        {
          ...body,
          customer_name: "Другой",
        },
        f.uid,
      ),
    (e) => e.code === "REQUEST_CONFLICT",
  );
});

test("order status transitions and history", async () => {
  const f = await fixture();
  const product = await f.catalog.saveProduct(f.uid, f.b.public_id, {
    name: "Букет",
    price: "2000",
    availability: "in_stock",
  });
  const order = await f.orders.checkout(
    f.b.id,
    checkoutBody({
      cart_items: [{ product_id: product.id, quantity: 1 }],
    }),
    f.uid,
  );
  assert.equal(order.status, "new");
  await f.orders.transitionStatus(f.uid, f.b.public_id, order.id, {
    status: "accepted",
  });
  await f.orders.transitionStatus(f.uid, f.b.public_id, order.id, {
    status: "assembling",
  });
  await f.orders.transitionStatus(f.uid, f.b.public_id, order.id, {
    status: "ready",
    note: "Готово к выдаче",
  });
  await assert.rejects(
    () =>
      f.orders.transitionStatus(f.uid, f.b.public_id, order.id, {
        status: "completed",
      }),
    (e) => e.code === "INVALID_STATUS_TRANSITION",
  );
  await f.orders.transitionStatus(f.uid, f.b.public_id, order.id, {
    status: "handed_over",
  });
  await f.orders.transitionStatus(f.uid, f.b.public_id, order.id, {
    status: "completed",
  });
  const detail = await f.orders.get(f.uid, f.b.public_id, order.id);
  assert.equal(detail.status, "completed");
  assert.ok(detail.history.length >= 6);
  const statuses = detail.history.map((h) => h.to_status);
  assert.deepEqual(
    statuses.slice(0, 6),
    ["new", "accepted", "assembling", "ready", "handed_over", "completed"],
  );
  assert.ok(detail.history.some((h) => h.note === "Готово к выдаче"));
});

test("cross-business isolation for products", async () => {
  const a = await fixture("Biz A");
  const b = await fixture("Biz B");
  const product = await a.catalog.saveProduct(a.uid, a.b.public_id, {
    name: "Секрет A",
    price: "99",
  });
  const listedA = await a.catalog.listProducts(a.uid, a.b.public_id);
  assert.ok(listedA.some((p) => p.id === product.id));
  const listedB = await b.catalog.listProducts(b.uid, b.b.public_id);
  assert.ok(!listedB.some((p) => p.id === product.id));
  await assert.rejects(
    () => b.catalog.getProduct(b.uid, b.b.public_id, product.id),
    (e) => e.code === "PRODUCT_NOT_FOUND" || e.code === "BUSINESS_NOT_FOUND",
  );
  await assert.rejects(
    () => a.catalog.getProduct(b.uid, a.b.public_id, product.id),
    (e) => e.code === "BUSINESS_NOT_FOUND" || e.code === "FORBIDDEN",
  );
});
