import type { Metadata } from "next";
import { ConnectionsView } from "@/components/connections/ConnectionsView";

export const metadata: Metadata = {
  title: "Подключения",
};

export default function ConnectionsPage() {
  return <ConnectionsView />;
}
