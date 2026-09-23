import type { Metadata } from "next";
import { LeadsConceptView } from "@/components/leads/LeadsConceptView";

export const metadata: Metadata = {
  title: "Приём заявок — концепт",
};

export default function LeadsConceptPage() {
  return <LeadsConceptView />;
}
