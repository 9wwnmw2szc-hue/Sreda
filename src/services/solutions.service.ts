import { isDemoMode } from "@/lib/dataMode";
import { apiRequest } from "@/lib/apiClient";
import { delay } from "@/lib/delay";
import { mockBusinessSolutions, mockSolutions } from "@/mocks/solutions";
import type { BusinessSolution, Solution } from "@/types";

export async function getSolutions(): Promise<Solution[]> {
  await delay();
  return mockSolutions;
}

export async function getSolution(id: string): Promise<Solution | null> {
  await delay();
  return mockSolutions.find((solution) => solution.id === id) ?? null;
}

export async function getSolutionByCode(
  code: string,
): Promise<Solution | null> {
  await delay();
  return mockSolutions.find((solution) => solution.code === code) ?? null;
}

export async function getBusinessSolutions(
  businessId: string,
): Promise<BusinessSolution[]> {
  if (!isDemoMode) return apiRequest<BusinessSolution[]>(`/api/v1/businesses/${encodeURIComponent(businessId)}/solutions`);
  await delay();
  return mockBusinessSolutions.filter(
    (item) => item.businessId === businessId,
  );
}
