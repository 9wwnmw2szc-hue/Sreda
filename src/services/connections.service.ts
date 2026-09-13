import { isDemoMode } from "@/lib/dataMode";
import { apiRequest } from "@/lib/apiClient";
import { delay } from "@/lib/delay";
import { mockConnections } from "@/mocks/connections";
import type { Connection } from "@/types";

export async function getConnections(
  businessId: string,
): Promise<Connection[]> {
  if (!isDemoMode) return (await apiRequest<Omit<Connection,"businessId">[]>(`/api/v1/businesses/${encodeURIComponent(businessId)}/connections`)).map(row => ({...row,businessId}));
  await delay();
  return mockConnections.filter(
    (connection) => connection.businessId === businessId,
  );
}

export async function getConnection(
  id: string,
): Promise<Connection | null> {
  if (!isDemoMode) return null;
  await delay();
  return mockConnections.find((connection) => connection.id === id) ?? null;
}
