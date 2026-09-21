/**
 * Product variant model + money formatting + catalog UX regressions.
 */
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
import { formatMoney } from "../src/lib/money.ts";

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

test("formatMoney uses spaced rubles", () => {
  assert.match(formatMoney(2500, "RUB"), /2.500.?₽/);
  assert.match(formatMoney("2350.00", "RUB"), /2.350.?₽/);
});

test("product without variants uses base price", async () => {
  const f = await fixture("Plain");
  const product = await f.catalog.saveProduct(f.uid, f.b.public_id, {
    name: "Кружка",
    price: "990",
    use_variants: false,
    active: true,
  });
  const got = await f.catalog.getProduct(f.uid, f.b.public_id, product.id);
  assert.equal(got.price, "990.00");
  assert.equal(got.use_variants, false);
  assert.equal(got.variants.length, 0);
});

test("size+color combinations have independent stock and inherit base price", async () => {
  const f = await fixture("Combo");
  const product = await f.catalog.saveProduct(f.uid, f.b.public_id, {
    name: "Шорты",
    price: "2500",
    use_variants: true,
    variant_prices_enabled: false,
    track_inventory: true,
    availability: "quantity",
    stock_quantity: 0,
    active: true,
    option_groups: [
      { name: "Размер", options: [{ name: "M" }, { name: "L" }] },
      { name: "Цвет", options: [{ name: "Чёрный" }, { name: "Белый" }] },
    ],
  });
  const loaded = await f.catalog.getProduct(f.uid, f.b.public_id, product.id);
  const byName = Object.fromEntries(loaded.options.map((o) => [o.name, o.id]));
  await f.catalog.saveProduct(
    f.uid,
    f.b.public_id,
    {
      name: "Шорты",
      price: "2500",
      use_variants: true,
      variant_prices_enabled: false,
      track_inventory: true,
      availability: "quantity",
      option_groups: [
        {
          id: loaded.option_groups[0].id,
          name: "Размер",
          options: loaded.options
            .filter((o) => o.group_id === loaded.option_groups[0].id)
            .map((o) => ({ id: o.id, name: o.name })),
        },
        {
          id: loaded.option_groups[1].id,
          name: "Цвет",
          options: loaded.options
            .filter((o) => o.group_id === loaded.option_groups[1].id)
            .map((o) => ({ id: o.id, name: o.name })),
        },
      ],
      variants: [
        {
          label: "M / Чёрный",
          option_ids: [byName["M"], byName["Чёрный"]],
          price: null,
          availability: "quantity",
          stock_quantity: 3,
          active: true,
        },
        {
          label: "M / Белый",
          option_ids: [byName["M"], byName["Белый"]],
          price: null,
          availability: "quantity",
          stock_quantity: 7,
          active: true,
        },
        {
          label: "L / Чёрный",
          option_ids: [byName["L"], byName["Чёрный"]],
          price: null,
          availability: "quantity",
          stock_quantity: 1,
          active: true,
        },
        {
          label: "L / Белый",
          option_ids: [byName["L"], byName["Белый"]],
          price: null,
          availability: "quantity",
          stock_quantity: 0,
          active: true,
        },
      ],
    },
    product.id,
  );
  const again = await f.catalog.getProduct(f.uid, f.b.public_id, product.id);
  assert.equal(again.variants.length, 4);
  for (const v of again.variants) assert.equal(v.price, null);
  const blackM = again.variants.find(
    (v) => v.label.includes("Чёрный") && v.label.startsWith("M"),
  );
  const whiteL = again.variants.find(
    (v) => v.label.includes("Белый") && v.label.startsWith("L"),
  );
  assert.equal(blackM.stock_quantity, 3);
  assert.equal(whiteL.stock_quantity, 0);

  await assert.rejects(
    () =>
      f.orders.checkout(f.b.id, {
        platform: "web",
        external_user_id: "u-" + randomUUID().slice(0, 6),
        customer_name: "Клиент",
        customer_phone: "+79991234567",
        fulfillment: "pickup",
        request_key: "rk-" + randomUUID(),
        cart_items: [
          { product_id: product.id, variant_id: whiteL.id, quantity: 1 },
        ],
      }),
    (e) => e.code === "OUT_OF_STOCK" || /склад/i.test(e.message),
  );

  const order = await f.orders.checkout(f.b.id, {
    platform: "web",
    external_user_id: "u-" + randomUUID().slice(0, 6),
    customer_name: "Клиент",
    customer_phone: "+79991234567",
    fulfillment: "pickup",
    request_key: "rk-" + randomUUID(),
    cart_items: [
      { product_id: product.id, variant_id: blackM.id, quantity: 2 },
    ],
  });
  assert.equal(order.total, "5000.00");
  const after = await f.catalog.getProduct(f.uid, f.b.public_id, product.id);
  assert.equal(
    after.variants.find((v) => v.id === blackM.id)?.stock_quantity,
    1,
  );
});

test("variant price override only when enabled", async () => {
  const f = await fixture("Override");
  const created = await f.catalog.saveProduct(f.uid, f.b.public_id, {
    name: "Футболка",
    price: "1500",
    use_variants: true,
    variant_prices_enabled: true,
    active: true,
    option_groups: [
      { name: "Размер", options: [{ name: "S" }, { name: "XL" }] },
    ],
  });
  const loaded = await f.catalog.getProduct(f.uid, f.b.public_id, created.id);
  const s = loaded.options.find((o) => o.name === "S");
  const xl = loaded.options.find((o) => o.name === "XL");
  await f.catalog.saveProduct(
    f.uid,
    f.b.public_id,
    {
      name: "Футболка",
      price: "1500",
      use_variants: true,
      variant_prices_enabled: true,
      option_groups: [
        {
          id: loaded.option_groups[0].id,
          name: "Размер",
          options: [
            { id: s.id, name: "S" },
            { id: xl.id, name: "XL" },
          ],
        },
      ],
      variants: [
        {
          label: "S",
          option_ids: [s.id],
          price: null,
          availability: "in_stock",
          active: true,
        },
        {
          label: "XL",
          option_ids: [xl.id],
          price: "1900",
          availability: "in_stock",
          active: true,
        },
      ],
    },
    created.id,
  );
  const again = await f.catalog.getProduct(f.uid, f.b.public_id, created.id);
  assert.equal(again.variants.find((v) => v.label === "S")?.price, null);
  assert.equal(again.variants.find((v) => v.label === "XL")?.price, "1900.00");
});
