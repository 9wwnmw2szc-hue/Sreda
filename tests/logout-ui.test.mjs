import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);

async function read(rel) {
  return readFile(new URL(rel, root), "utf8");
}

test("desktop topbar actions order is utility, add, then profile", async () => {
  const shell = await read("./src/components/layout/AppShell.tsx");
  const css = await read("./src/app/globals.css");
  const utility = shell.indexOf("desktop-topbar__utility");
  const create = shell.indexOf('className="create-menu"');
  const profile = shell.indexOf('className="profile-menu"');
  assert.ok(utility > 0);
  assert.ok(create > utility);
  assert.ok(profile > create);
  assert.match(css, /\.desktop-topbar__actions/);
  assert.match(css, /display:\s*flex/);
  assert.match(css, /\.desktop-topbar__utility/);
  assert.match(css, /gap:\s*var\(--space-4\)/);
  assert.match(css, /gap:\s*var\(--space-8\)/);
  assert.match(css, /text-overflow:\s*ellipsis/);
});

test("desktop profile menu and mobile sidebar expose logout action", async () => {
  const shell = await read("./src/components/layout/AppShell.tsx");
  const sidebar = await read("./src/components/layout/Sidebar.tsx");
  const settings = await read("./src/components/account/SettingsView.tsx");
  const button = await read("./src/components/account/SignOutButton.tsx");

  assert.match(shell, /profile-menu/);
  assert.match(shell, /SignOutButton/);
  assert.match(shell, /variant="menu"/);

  assert.match(sidebar, /sidebar__sign-out/);
  assert.match(sidebar, /variant="sidebar"/);
  assert.match(sidebar, /SignOutButton/);

  assert.match(settings, /SignOutButton/);
  assert.match(settings, /Данные аккаунта/);
  assert.match(settings, /Безопасность/);
  assert.match(settings, /settings-sign-out-panel/);
  assert.match(settings, /BusinessDeletionPanel/);
  assert.match(settings, /AccountDeletionPanel/);
  const accountIdx = settings.indexOf('section === "account"');
  const signOutIdx = settings.indexOf("settings-sign-out-panel");
  const securityIdx = settings.indexOf('settings-security-heading');
  const accountDangerMount = settings.indexOf('id="account-danger"');
  const dangerIdx = settings.indexOf('section === "danger"');
  const bizDangerIdx = settings.indexOf("<BusinessDeletionPanel");
  assert.ok(accountIdx > 0 && signOutIdx > accountIdx);
  assert.ok(securityIdx > signOutIdx);
  assert.ok(accountDangerMount > securityIdx && accountDangerMount < dangerIdx);
  assert.ok(dangerIdx > accountIdx && bizDangerIdx > dangerIdx);
  assert.ok(settings.indexOf("<AccountDeletionPanel", dangerIdx) > bizDangerIdx);

  assert.match(
    await read("./src/components/account/AccountDeletionPanel.tsx"),
    /Удалить аккаунт/,
  );
  assert.match(
    await read("./src/components/account/AccountDeletionPanel.tsx"),
    /Удаление аккаунта/,
  );
  assert.match(
    await read("./src/components/account/BusinessDeletionPanel.tsx"),
    /Удалить бизнес/,
  );
  assert.match(
    await read("./src/components/account/BusinessDeletionPanel.tsx"),
    /Опасная зона бизнеса/,
  );

  assert.match(button, /Выйти из аккаунта\?/);
  assert.match(button, /Текущая сессия будет завершена на этом устройстве/);
  assert.match(button, /\/api\/auth\/sign-out/);
  assert.match(button, /location\.replace\("\/login"\)/);
  assert.match(button, /soty\.theme/);
  assert.match(button, /aria-label="Выйти из аккаунта"/);
  assert.match(button, /onCancel/);
  assert.match(button, /focusable/);
});

test("settings CSS keeps logout content-driven without space-between pin", async () => {
  const css = await read("./src/app/globals.css");
  assert.match(css, /\.settings-sign-out-panel/);
  assert.match(css, /\.business-danger-zone/);
  assert.match(css, /min-height:\s*0/);
  assert.doesNotMatch(
    css.slice(css.indexOf(".settings-sign-out-panel")),
    /\.settings-sign-out-panel[^{]*\{[^}]*justify-content:\s*space-between/,
  );
});

test("sign-out clears site data and keeps theme preference logic", async () => {
  const auth = await read("./src/server/http/auth-handler.ts");
  const button = await read("./src/components/account/SignOutButton.tsx");
  assert.match(auth, /Clear-Site-Data/);
  assert.match(auth, /"cache"/);
  assert.match(button, /clearClientAuthState/);
  assert.match(button, /key\.startsWith\("sreda\."\)/);
  assert.equal(button.includes('localStorage.removeItem("soty.theme")'), false);
});

test("app shell reloads bfcache pages to avoid restoring auth UI", async () => {
  const shell = await read("./src/components/layout/AppShell.tsx");
  assert.match(shell, /pageshow/);
  assert.match(shell, /event\.persisted/);
  assert.match(shell, /location\.reload/);
});

test("protected app layout stays dynamic and redirects unauthenticated users", async () => {
  const layout = await read("./src/app/(app)/layout.tsx");
  const pageUser = await read("./src/server/identity/page-user.ts");
  assert.match(layout, /force-dynamic/);
  assert.match(layout, /pageUser/);
  assert.match(pageUser, /redirect\("\/login"\)/);
});
