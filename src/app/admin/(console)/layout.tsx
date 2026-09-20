import type { ReactNode } from "react";
import { requireAdminPage } from "@/server/admin/page-admin";
import { platformPermissions } from "@/server/admin/permissions";
import { filterAdminNav } from "@/config/adminNav";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireAdminPage();
  const permissions = platformPermissions(user.role);
  const nav = filterAdminNav(permissions);

  return (
    <AdminShell
      user={{
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        permissions,
      }}
      nav={nav}
    >
      {children}
    </AdminShell>
  );
}
