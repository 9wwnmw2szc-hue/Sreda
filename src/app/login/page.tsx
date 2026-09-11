import type { Metadata } from "next";
import { AccountFrame } from "@/components/account/AccountFrame";
import { LoginForm } from "@/components/account/LoginForm";
export const metadata: Metadata = { title: "Вход", robots: { index: false, follow: false } };
export default function LoginPage() {
  return <AccountFrame><LoginForm /></AccountFrame>;
}
