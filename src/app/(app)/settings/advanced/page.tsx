import type { Metadata } from "next";
import { AdvancedSettingsView } from "@/components/onboarding/AdvancedSettingsView";

export const metadata: Metadata = { title: "Расширенная настройка" };

export default function AdvancedSettingsPage() {
  return <AdvancedSettingsView />;
}
