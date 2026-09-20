/** Client-safe mirror of PLATFORM_NAV / platform permission keys. */

export type AdminPermission =
  | "admin.users.read"
  | "admin.users.manage"
  | "admin.businesses.read"
  | "admin.businesses.manage"
  | "admin.subscriptions.read"
  | "admin.subscriptions.manage"
  | "admin.integrations.read"
  | "admin.integrations.manage"
  | "admin.support.read"
  | "admin.support.manage"
  | "admin.moderation.read"
  | "admin.moderation.manage"
  | "admin.system.read"
  | "admin.system.manage"
  | "admin.audit.read"
  | "admin.admins.manage"
  | "admin.search";

export type AdminNavItem = {
  href: string;
  label: string;
  permission: AdminPermission;
};

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin", label: "Обзор", permission: "admin.system.read" },
  { href: "/admin/users", label: "Пользователи", permission: "admin.users.read" },
  {
    href: "/admin/businesses",
    label: "Бизнесы",
    permission: "admin.businesses.read",
  },
  {
    href: "/admin/subscriptions",
    label: "Подписки",
    permission: "admin.subscriptions.read",
  },
  {
    href: "/admin/integrations",
    label: "Интеграции",
    permission: "admin.integrations.read",
  },
  {
    href: "/admin/support",
    label: "Поддержка",
    permission: "admin.support.read",
  },
  {
    href: "/admin/moderation",
    label: "Модерация",
    permission: "admin.moderation.read",
  },
  { href: "/admin/system", label: "Система", permission: "admin.system.read" },
  { href: "/admin/audit", label: "Аудит", permission: "admin.audit.read" },
  {
    href: "/admin/settings",
    label: "Настройки",
    permission: "admin.admins.manage",
  },
];

export function filterAdminNav(
  permissions: readonly string[],
): AdminNavItem[] {
  const set = new Set(permissions);
  return ADMIN_NAV.filter((item) => set.has(item.permission));
}
