import type { Metadata } from "next";
import { SettingsView } from "@/components/account/SettingsView";
export const metadata: Metadata = { title: "Настройки" };
export default function SettingsPage() { return <SettingsView />; }
