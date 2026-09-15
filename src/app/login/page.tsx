import type { Metadata } from "next";
import { LoginFrame } from "@/components/account/LoginFrame";
import { LoginForm } from "@/components/account/LoginForm";
export const metadata: Metadata = { title: "Вход", robots: { index: false, follow: false } };
export default function LoginPage() {
  return <LoginFrame><LoginForm /></LoginFrame>;
}
