import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("solution cards do not show «Рекомендуем» badge", async () => {
  const catalog = await readFile(
    new URL("../src/components/solutions/SolutionsCatalog.tsx", import.meta.url),
    "utf8",
  );
  const moduleSrc = await readFile(
    new URL("../src/components/dashboard/SolutionModule.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(catalog.includes("Рекомендуем"), false);
  assert.equal(moduleSrc.includes("Рекомендуем"), false);
  assert.equal(catalog.includes("recommend-badge"), false);
  assert.equal(moduleSrc.includes("recommend-badge"), false);
});

test("bot router greets with business brand, not platform name", async () => {
  const router = await readFile(
    new URL("../src/server/bot/router.ts", import.meta.url),
    "utf8",
  );
  assert.match(router, /public_name \|\| b\.name/);
  assert.match(router, /Добро пожаловать в \$\{brand\}/);
  assert.match(router, /never introduce as platform/);
  assert.match(router, /Записаться/);
  assert.match(router, /Связаться с администратором/);
});

test("auto-schedule panel is wired into BookingsView", async () => {
  const view = await readFile(
    new URL("../src/components/booking/BookingsView.tsx", import.meta.url),
    "utf8",
  );
  assert.match(view, /AutoSchedulePanel/);
  assert.match(view, /BookingSetupWizard/);
  assert.match(view, /Перерыв между клиентами/);
  assert.match(view, /Расширенные настройки/);
});

test("booking setup wizard exposes guided steps", async () => {
  const wizard = await readFile(
    new URL("../src/components/booking/BookingSetupWizard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(wizard, /Шаг \{step\} из \{stepCount\}|SetupWizardShell/);
  assert.match(wizard, /Услуги/);
  assert.match(wizard, /Кто оказывает/);
  assert.match(wizard, /Расписание/);
  assert.match(wizard, /Правила/);
  assert.match(wizard, /Проверка/);
  assert.match(wizard, /Запустить/);
  assert.match(wizard, /TOTAL_STEPS/);
});
