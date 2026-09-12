import type { Metadata } from "next";
import { AccountFrame } from "@/components/account/AccountFrame";
import { LoginForm } from "@/components/account/LoginForm";
export const metadata: Metadata = { title: "Регистрация", robots: { index: false, follow: false } };
export default function RegisterPage() {
  return <AccountFrame><LoginForm register /></AccountFrame>;
}
