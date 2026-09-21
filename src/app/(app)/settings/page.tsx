import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "@/components/account/SettingsView";
export const metadata: Metadata = { title: "Настройки" };
export default function SettingsPage() {
  return (
    <Suspense fallback={<p>Загрузка настроек…</p>}>
      <SettingsView />
    </Suspense>
  );
}
