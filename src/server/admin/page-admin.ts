import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntime } from "../runtime";
import {
  platformAllowed,
  type PlatformAdminPermission,
  type PlatformAdminRole,
} from "../admin/permissions";

export type AdminPageUser = {
  id: string;
  name: string;
  username: string;
  role: PlatformAdminRole;
};

/** Server-side admin gate for RSC pages. Never trust client nav alone. */
export async function requireAdminPage(
  permission?: PlatformAdminPermission,
): Promise<AdminPageUser> {
  const runtime = getRuntime();
  let sessionUser: { id: string; username?: string | null } | null = null;
  try {
    const session = await runtime.auth.api.getSession({
      headers: await headers(),
    });
    if (session?.user?.username) sessionUser = session.user;
  } catch {
    sessionUser = null;
  }
  if (!sessionUser) redirect("/admin/login");

  const row = await runtime.db
    .selectFrom("platform_admin as a")
    .innerJoin("user as u", "u.id", "a.user_id")
    .select(["u.public_id", "u.name", "u.username", "a.role", "a.status"])
    .where("a.user_id", "=", sessionUser.id)
    .where("a.status", "=", "active")
    .executeTakeFirst();

  if (!row) redirect("/admin/login?denied=1");

  const role = row.role as PlatformAdminRole;
  if (permission && !platformAllowed(role, permission)) {
    redirect("/admin?forbidden=1");
  }

  return {
    id: row.public_id,
    name: row.name,
    username: row.username,
    role,
  };
}
