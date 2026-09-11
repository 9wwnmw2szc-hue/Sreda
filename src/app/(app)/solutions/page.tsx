import type { Metadata } from "next";
import { SolutionsCatalog } from "@/components/solutions/SolutionsCatalog";
import { getSolutions } from "@/services/solutions.service";
export const metadata: Metadata = { title: "Мои решения" };
export default async function SolutionsPage() {
  const solutions = await getSolutions();
  return <SolutionsCatalog solutions={solutions} />;
}
