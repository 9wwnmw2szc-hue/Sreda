import type { Metadata } from "next";
import { LeadsView } from "@/components/leads/LeadsView";
export const metadata: Metadata = { title: "Заявки" };
export default function LeadsPage() { return <LeadsView />; }
