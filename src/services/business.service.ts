import { delay } from "@/lib/delay";
import { mockBusinesses } from "@/mocks/businesses";
import type { Business } from "@/types";

export async function getBusinesses(ownerId?: string): Promise<Business[]> {
  await delay();
  if (!ownerId) return mockBusinesses;
  return mockBusinesses.filter((business) => business.ownerId === ownerId);
}

export async function getBusiness(id: string): Promise<Business | null> {
  await delay();
  return mockBusinesses.find((business) => business.id === id) ?? null;
}
