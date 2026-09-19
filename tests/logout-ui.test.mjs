import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);

async function read(rel) {
  return readFile(new URL(rel, root), "utf8");
}

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
  assert.match(settings, /Выйти из аккаунта|SignOutButton/);

  assert.match(button, /Выйти из аккаунта\?/);
  assert.match(button, /Текущая сессия будет завершена на этом устройстве/);
  assert.match(button, /\/api\/auth\/sign-out/);
  assert.match(button, /location\.replace\("\/login"\)/);
  assert.match(button, /soty\.theme/);
  assert.match(button, /aria-label="Выйти из аккаунта"/);
  assert.match(button, /onCancel/);
  assert.match(button, /focusable/);
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
