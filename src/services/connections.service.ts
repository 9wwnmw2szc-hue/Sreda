import { delay } from "@/lib/delay";
import { mockConnections } from "@/mocks/connections";
import type { Connection } from "@/types";

export async function getConnections(
  businessId: string,
): Promise<Connection[]> {
  await delay();
  return mockConnections.filter(
    (connection) => connection.businessId === businessId,
  );
}

export async function getConnection(
  id: string,
): Promise<Connection | null> {
  await delay();
  return mockConnections.find((connection) => connection.id === id) ?? null;
}
