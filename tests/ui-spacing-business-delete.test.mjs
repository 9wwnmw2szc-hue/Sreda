import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);

async function read(rel) {
  return readFile(new URL(rel, root), "utf8");
}

test("customer actions resolver is shared and not hardcoded per platform", async () => {
  const actions = await read("./src/server/solutions/customer-actions.ts");
  const router = await read("./src/server/bot/router.ts");
  assert.match(actions, /getAvailableCustomerActions/);
  assert.match(actions, /assertCustomerActionAvailable/);
  assert.match(actions, /CustomerActionCode/);
  assert.doesNotMatch(actions, /автопост|autopost/i);
  assert.match(router, /getAvailableCustomerActions/);
  assert.match(router, /denyDisabled/);
  assert.match(router, /Эта функция временно недоступна\./);
});

test("catalog and solution cards keep content-driven spacing from actions", async () => {
  const css = await read("./src/app/globals.css");
  assert.match(css, /Content \/ action separation/);
  assert.match(css, /\.catalog-card \.button/);
  assert.match(css, /margin-top:\s*var\(--space-4\)/);
  assert.match(css, /\.biznesoty-solution-card__chevron[\s\S]*position:\s*static/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

test("business deletion API route and panel exist", async () => {
  const route = await read(
    "./src/app/api/v1/businesses/[id]/deletion/route.ts",
  );
  const panel = await read("./src/components/account/BusinessDeletionPanel.tsx");
  const migration = await read("./migrations/049_business_deletion.sql");
  assert.match(route, /createBusinessDeletionHandler/);
  assert.match(panel, /Удалить бизнес навсегда/);
  assert.match(panel, /BUSINESS_DELETION_PHRASE/);
  assert.match(migration, /business_deletion_request/);
  assert.doesNotMatch(migration, /DROP DATABASE|TRUNCATE/i);
});
