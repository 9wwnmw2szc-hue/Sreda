import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mockSolutions } from "../src/mocks/solutions.ts";
import {
  SOLUTION_DESTINATIONS,
  solutionRoute,
  solutionVisualCode,
} from "../src/config/solutionPresentation.ts";
import { WORKSPACE_SOLUTION_ORDER } from "../src/config/solutions.ts";
import { NAV_ITEMS } from "../src/config/navigation.ts";
import {
  PRODUCT_SOLUTIONS,
  formatSolutionPrice,
  productSolutionCta,
  productSolutionHref,
} from "../src/lib/productSolutions.ts";
import {
  recommendedSolutionCodes,
  recommendationSummary,
} from "../src/lib/businessTypeRecommendations.ts";
import { solutionStatusLabel } from "../src/lib/labels.ts";
import { SOLUTIONS, ACTIVATABLE_SOLUTIONS } from "../src/server/solutions/catalog.ts";

test("product catalog uses current solution names without Продажи", () => {
  assert.deepEqual(
    PRODUCT_SOLUTIONS.map((s) => s.code).sort(),
    ["admin_messages", "autopost", "booking", "leads", "orders"],
  );
  assert.equal(
    PRODUCT_SOLUTIONS.find((s) => s.code === "orders")?.name,
    "Приём заказов",
  );
  assert.equal(
    PRODUCT_SOLUTIONS.find((s) => s.code === "leads")?.name,
    "Приём заявок",
  );
  assert.equal(
    PRODUCT_SOLUTIONS.find((s) => s.code === "booking")?.name,
    "Онлайн-запись",
  );
  assert.equal(
    PRODUCT_SOLUTIONS.find((s) => s.code === "admin_messages")?.name,
    "Связь с администратором",
  );
  assert.equal(
    PRODUCT_SOLUTIONS.find((s) => s.code === "admin_messages")?.price,
    0,
  );
  assert.equal(
    PRODUCT_SOLUTIONS.find((s) => s.code === "admin_messages")?.messageLimit,
    300,
  );
  assert.equal(
    mockSolutions.some((s) => /продаж/i.test(s.name)),
    false,
  );
});

test("server catalog stays in sync with product names and free inbox", () => {
  for (const code of ACTIVATABLE_SOLUTIONS) {
    const product = PRODUCT_SOLUTIONS.find((s) => s.code === code);
    const server = SOLUTIONS.find((s) => s.code === code);
    assert.ok(product && server);
    assert.equal(server.title, product.name);
    assert.equal(server.priceRub, product.price);
  }
});

test("CTA and href follow solution lifecycle", () => {
  assert.equal(productSolutionCta("available"), "Подключить");
  assert.equal(productSolutionCta("setup_required"), "Продолжить настройку");
  assert.equal(productSolutionCta("active"), "Настроить");
  assert.equal(productSolutionCta("active", "admin_messages"), "Открыть");
  assert.equal(productSolutionHref("available", "orders"), "/orders?tab=catalog");
  assert.equal(productSolutionHref("active", "orders"), "/orders");
  assert.equal(productSolutionHref("setup_required", "booking"), "/bookings?tab=config");
  assert.equal(productSolutionHref("setup_required", "admin_messages"), "/connections");
  assert.equal(formatSolutionPrice(0, 300), "Бесплатно · до 300 сообщений/мес.");
  assert.equal(formatSolutionPrice(250), "250 ₽/мес.");
});

test("status labels never say coming soon for connectable solutions", () => {
  assert.equal(solutionStatusLabel("available"), "Не подключено");
  assert.equal(solutionStatusLabel("unavailable"), "Недоступно");
  assert.notEqual(solutionStatusLabel("unavailable"), "Скоро появится");
  const moduleSource = readFileSync(
    new URL("../src/components/dashboard/SolutionModule.tsx", import.meta.url),
  ).toString();
  assert.equal(moduleSource.includes("Скоро появится"), false);
  assert.equal(moduleSource.includes("Скоро в Среде"), false);
});

test("business type recommendations match product model", () => {
  assert.deepEqual(recommendedSolutionCodes("store"), [
    "orders",
    "admin_messages",
    "autopost",
  ]);
  assert.deepEqual(recommendedSolutionCodes("service"), [
    "leads",
    "booking",
    "admin_messages",
    "autopost",
  ]);
  assert.deepEqual(
    recommendedSolutionCodes("hybrid").sort(),
    PRODUCT_SOLUTIONS.map((s) => s.code).sort(),
  );
  assert.match(recommendationSummary("store"), /Приём заказов/);
});

test("navigation and destinations expose activated products", async () => {
  const { SECONDARY_NAV_ITEMS } = await import("../src/config/navigation.ts");
  for (const solution of mockSolutions) {
    assert.equal(solutionRoute(solution.code), SOLUTION_DESTINATIONS[solution.code]);
  }
  assert.equal(solutionVisualCode("orders"), "orders");
  assert.equal(solutionVisualCode("admin_messages"), "messages");
  assert.notEqual(solutionVisualCode("orders"), solutionVisualCode("admin_messages"));
  const hrefs = [...NAV_ITEMS, ...SECONDARY_NAV_ITEMS].map((item) => item.href);
  for (const href of [
    "/dashboard",
    "/solutions",
    "/orders",
    "/leads",
    "/bookings",
    "/messages",
    "/posts",
    "/calendar",
    "/clients",
    "/notifications",
    "/settings",
    "/billing",
  ]) {
    assert.ok(hrefs.includes(href), href);
  }
  assert.equal(NAV_ITEMS.some((item) => item.href === "/connections"), false);
  assert.equal(NAV_ITEMS[1]?.href, "/solutions");
  assert.equal(NAV_ITEMS[2]?.href, "/messages");
  assert.ok(WORKSPACE_SOLUTION_ORDER.includes("orders"));
  assert.equal(
    NAV_ITEMS.find((item) => item.href === "/orders")?.label,
    "Заказы",
  );
});
