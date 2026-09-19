import { AppShell } from "@/components/layout/AppShell";
import { redirect } from "next/navigation";
import { pageUser } from "@/server/identity/page-user";
import { getRuntime } from "@/server/runtime";
import { isDemoMode } from "@/lib/dataMode";
import { mockUser } from "@/mocks/user";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    other: {
      "Cache-Control": "private, no-store",
    },
  };
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = isDemoMode ? mockUser : await pageUser();
  if (!isDemoMode && !(await getRuntime().workspaces.list(user.id)).length) redirect("/business/new");
  return <AppShell user={user}>{children}</AppShell>;
}
