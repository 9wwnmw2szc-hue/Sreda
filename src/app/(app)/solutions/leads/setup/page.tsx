import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeadsSetupView } from "@/components/onboarding/LeadsSetupView";
import { getSolutionByCode } from "@/services/solutions.service";
export const metadata: Metadata = { title: "Настройка приёма заявок" };
export default async function LeadsSetupPage() {
  const solution = await getSolutionByCode("leads");
  if (!solution) notFound();
  return <LeadsSetupView price={solution.price} />;
}
