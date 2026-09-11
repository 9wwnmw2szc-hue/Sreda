import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntime } from "../runtime";

export async function pageUser() {
  let user = null;
  try {
    const session = await getRuntime().auth.api.getSession({ headers: await headers() });
    if (session?.user.emailVerified) user = session.user;
  } catch {
    // No mock session or build-time secret fallback when infrastructure is absent.
  }
  if (!user) redirect("/login");
  return { id: user.id, name: user.name, email: user.email };
}
