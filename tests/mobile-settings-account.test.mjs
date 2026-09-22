import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summarizeUserAgent } from "../src/server/identity/sessions.ts";

const root = new URL("..", import.meta.url);

async function read(rel) {
  return readFile(new URL(rel, root), "utf8");
}

test("mobile header uses icon search and actions row", async () => {
  const shell = await read("./src/components/layout/AppShell.tsx");
  const search = await read("./src/components/dashboard/CommandSearch.tsx");
  const css = await read("./src/app/globals.css");
  assert.match(shell, /mobile-header__actions/);
  assert.match(shell, /CommandSearch mobile/);
  assert.doesNotMatch(
    shell.slice(shell.indexOf("mobile-header")),
    /CommandSearch compact/,
  );
  assert.match(search, /soty-command--mobile/);
  assert.match(search, /soty-command__sheet/);
  assert.match(search, /aria-label="Поиск"/);
  assert.match(css, /\.mobile-header__actions/);
  assert.match(css, /\.soty-command--mobile/);
  assert.match(css, /\.soty-command__sheet/);
  assert.match(css, /\.notification-bell\s*\{[^}]*position:\s*relative/s);
});

test("settings business stack separates refresh, selector, add", async () => {
  const settings = await read("./src/components/account/SettingsView.tsx");
  const css = await read("./src/app/globals.css");
  assert.match(settings, /settings-business-stack/);
  assert.match(settings, /settings-business-refresh/);
  assert.match(settings, /Обновить/);
  assert.match(css, /\.settings-business-stack/);
  assert.match(css, /gap:\s*var\(--space-4\)/);
});

test("settings typography tokens separate label and value", async () => {
  const css = await read("./src/app/globals.css");
  assert.match(css, /--font-size-label:\s*0\.8125rem/);
  assert.match(css, /--font-size-value:\s*1rem/);
  assert.match(css, /--text-disabled:/);
  assert.match(css, /\.settings-meta-list dt/);
  assert.match(css, /\.settings-meta-list dd/);
});

test("session cards keep revoke label intact", async () => {
  const panel = await read("./src/components/account/SessionsPanel.tsx");
  const css = await read("./src/app/globals.css");
  assert.match(panel, /session-card/);
  assert.match(panel, /Завершить/);
  assert.doesNotMatch(panel, /Завершить\s*\n\s*ть/);
  assert.match(panel, /Выйти на всех других устройствах/);
  assert.match(panel, /Это устройство/);
  assert.match(css, /\.session-card__revoke/);
  assert.match(css, /white-space:\s*nowrap/);
  assert.match(css, /overflow-wrap:\s*normal/);
  assert.match(css, /word-break:\s*keep-all/);
});

test("summarizeUserAgent never invents a phone model", () => {
  assert.equal(summarizeUserAgent(null), "Неизвестное устройство");
  assert.equal(summarizeUserAgent(""), "Неизвестное устройство");
  assert.match(
    summarizeUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    ),
    /Safari · iPhone/,
  );
  assert.match(
    summarizeUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ),
    /Chrome · Windows/,
  );
});

test("PIN uses switch semantics and recovery is separated", async () => {
  const pin = await read("./src/components/account/PinPanel.tsx");
  assert.match(pin, /role="switch"/);
  assert.match(pin, /settings-switch/);
  assert.match(pin, /PIN-код при входе/);
  assert.doesNotMatch(pin, /Запрашивать PIN:/);
  assert.match(pin, /settings-pin-recovery/);
  assert.match(pin, /Восстановить доступ резервным кодом/);
});

test("recovery codes panel has status and one-time copy flow", async () => {
  const panel = await read("./src/components/account/RecoveryCodesPanel.tsx");
  assert.match(panel, /Осталось кодов/);
  assert.match(panel, /Создать новый набор/);
  assert.match(panel, /Скачать \.txt/);
  assert.match(panel, /показаны только сейчас/);
});

test("account deletion is reachable from Account and Danger sections", async () => {
  const settings = await read("./src/components/account/SettingsView.tsx");
  const accountIdx = settings.indexOf('section === "account"');
  const dangerIdx = settings.indexOf('section === "danger"');
  const accountSlice = settings.slice(accountIdx, dangerIdx);
  const dangerSlice = settings.slice(dangerIdx);
  // Account points to Danger zone; the destructive panel mounts only there.
  assert.match(accountSlice, /settings\?section=danger/);
  assert.match(accountSlice, /Опасная зона/);
  assert.equal(accountSlice.includes("<AccountDeletionPanel"), false);
  assert.ok(dangerSlice.includes('id="account-danger"'));
  assert.ok(dangerSlice.includes("<AccountDeletionPanel"));
  assert.ok(dangerSlice.includes("<BusinessDeletionPanel"));
});

test("bottom nav clearance uses safe-area token", async () => {
  const css = await read("./src/app/globals.css");
  assert.match(css, /--bottom-nav-clearance:\s*calc\(96px \+ env\(safe-area-inset-bottom/);
  assert.match(css, /padding-bottom:\s*calc\(var\(--space-6\) \+ var\(--bottom-nav-clearance\)\)/);
});
