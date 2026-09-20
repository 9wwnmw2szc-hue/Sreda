/** Platform staff roles — distinct from tenant business_member Role. */
export type PlatformAdminRole =
  | "SUPER_ADMIN"
  | "SUPPORT"
  | "MODERATOR"
  | "FINANCE";

export type PlatformAdminPermission =
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

const ALL: readonly PlatformAdminPermission[] = [
  "admin.users.read",
  "admin.users.manage",
  "admin.businesses.read",
  "admin.businesses.manage",
  "admin.subscriptions.read",
  "admin.subscriptions.manage",
  "admin.integrations.read",
  "admin.integrations.manage",
  "admin.support.read",
  "admin.support.manage",
  "admin.moderation.read",
  "admin.moderation.manage",
  "admin.system.read",
  "admin.system.manage",
  "admin.audit.read",
  "admin.admins.manage",
  "admin.search",
];

const ROLE_PERMISSIONS: Record<
  PlatformAdminRole,
  readonly PlatformAdminPermission[]
> = {
  SUPER_ADMIN: ALL,
  SUPPORT: [
    "admin.users.read",
    "admin.businesses.read",
    "admin.subscriptions.read",
    "admin.integrations.read",
    "admin.support.read",
    "admin.support.manage",
    "admin.system.read",
    "admin.audit.read",
    "admin.search",
  ],
  MODERATOR: [
    "admin.moderation.read",
    "admin.moderation.manage",
    "admin.businesses.read",
    "admin.users.read",
    "admin.search",
  ],
  FINANCE: [
    "admin.subscriptions.read",
    "admin.subscriptions.manage",
    "admin.businesses.read",
    "admin.users.read",
    "admin.audit.read",
    "admin.search",
  ],
};

export function platformPermissions(
  role: PlatformAdminRole,
): readonly PlatformAdminPermission[] {
  return ROLE_PERMISSIONS[role];
}

export function platformAllowed(
  role: PlatformAdminRole,
  permission: PlatformAdminPermission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const PLATFORM_NAV: {
  href: string;
  label: string;
  permission: PlatformAdminPermission;
}[] = [
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
