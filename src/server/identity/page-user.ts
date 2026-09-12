import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntime } from "../runtime";

export async function pageUser() {
  let user = null;
  try {
    const session = await getRuntime().auth.api.getSession({ headers: await headers() });
    if (session?.user.username) user = session.user;
  } catch {
    // No mock session or build-time secret fallback when infrastructure is absent.
  }
  if (!user) redirect("/login");
  const publicUser = await getRuntime().db.selectFrom("user").select(["public_id", "name", "username"]).where("id", "=", user.id).executeTakeFirst();
  if (!publicUser) redirect("/login");
  return { id: publicUser.public_id, name: publicUser.name, username: publicUser.username };
}
