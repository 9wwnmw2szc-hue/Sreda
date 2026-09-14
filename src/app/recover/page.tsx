import type { Metadata } from "next";
import { AccountFrame } from "@/components/account/AccountFrame";
import { RecoverAccountForm } from "@/components/account/RecoverAccountForm";
export const metadata: Metadata = { title: "Восстановление доступа", robots: { index: false, follow: false } };
export default function RecoverPage() { return <AccountFrame><RecoverAccountForm /></AccountFrame>; }
