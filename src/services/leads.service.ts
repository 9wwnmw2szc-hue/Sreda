import { isDemoMode } from "@/lib/dataMode";
import { delay } from "@/lib/delay";
import { apiRequest } from "@/lib/apiClient";
import { mockLeads } from "@/mocks/leads";
import type { Lead, LeadStatus } from "@/types";

export async function getLeads(businessId: string): Promise<Lead[]> {
  if (!isDemoMode) return apiRequest<Lead[]>("/api/v1/businesses/" + encodeURIComponent(businessId) + "/leads");
  await delay();
  return mockLeads.filter((lead) => lead.businessId === businessId);
}

export async function getRecentLeads(
  businessId: string,
  limit = 5,
): Promise<Lead[]> {
  const leads = await getLeads(businessId);
  return [...leads]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
}

export async function getLeadsByStatus(
  businessId: string,
  status: LeadStatus,
): Promise<Lead[]> {
  const leads = await getLeads(businessId);
  return leads.filter((lead) => lead.status === status);
}
