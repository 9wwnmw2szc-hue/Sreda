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
  return getLeadPage(businessId, status);
}

export async function getLeadPage(businessId: string, status?: LeadStatus, before?: string,filters:Record<string,string>={}): Promise<Lead[]> {
  if (isDemoMode) {
    const rows = (await getLeads(businessId)).filter((lead) => !status || lead.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const start = before ? rows.findIndex((lead) => `${lead.createdAt}|${lead.id}` === before) + 1 : 0;
    return rows.slice(start, start + 100);
  }
  const params = new URLSearchParams(Object.entries(filters).filter(([,v])=>!!v));
  if (status) params.set("status", status);
  if (before) params.set("before", before);
  return apiRequest<Lead[]>(`/api/v1/businesses/${encodeURIComponent(businessId)}/leads?${params}`);
}

export async function updateLeadStatus(businessId: string, id: string, status: LeadStatus): Promise<Lead> {
  if (isDemoMode) throw new Error("В демонстрации изменение статуса недоступно.");
  return apiRequest<Lead>(`/api/v1/businesses/${encodeURIComponent(businessId)}/leads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
}
