import { apiRequest } from "@/lib/apiClient";
import { isDemoMode } from "@/lib/dataMode";
import { mockBusinesses } from "@/mocks/businesses";
import type { Business } from "@/types";
export async function getBusinesses(): Promise<Business[]> {
  return isDemoMode ? mockBusinesses : apiRequest<Business[]>("/api/v1/businesses");
}
export async function getBusiness(id: string): Promise<Business | null> {
  return isDemoMode ? mockBusinesses.find((item) => item.id === id) ?? null
    : apiRequest<Business>("/api/v1/businesses/" + encodeURIComponent(id));
}
