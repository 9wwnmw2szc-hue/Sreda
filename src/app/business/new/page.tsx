import { AccountFrame } from "@/components/account/AccountFrame";
import { CreateBusinessForm } from "@/components/account/CreateBusinessForm";
import { SignOutButton } from "@/components/account/SignOutButton";
import { pageUser } from "@/server/identity/page-user";
import { getRuntime } from "@/server/runtime";
export const dynamic = "force-dynamic";
export default async function NewBusinessPage() {
  const user = await pageUser();
  const businesses = await getRuntime().workspaces.list(user.id);
  return <AccountFrame><div><CreateBusinessForm userId={user.id} hasBusinesses={businesses.length > 0} />
    <div className="account-exit"><SignOutButton /></div></div></AccountFrame>;
}
