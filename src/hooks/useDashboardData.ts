"use client";
import { useEffect, useState } from "react";
import { WORKSPACE_SOLUTION_ORDER, SOLUTION_VISUALS } from "@/config/solutions";
import type { SolutionAccentCode } from "@/config/design";
import { useCurrentBusiness } from "@/hooks/useCurrentBusiness";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getBilling } from "@/services/billing.service";
import { getConnections } from "@/services/connections.service";
import { getRecentLeads } from "@/services/leads.service";
import { getScheduledPosts } from "@/services/posts.service";
import {
  getBusinessSolutions,
  getSolutions,
} from "@/services/solutions.service";
import type {
  BillingInfo,
  Connection,
  Lead,
  Post,
  Solution,
  SolutionStatus,
} from "@/types";
export interface WorkspaceSolutionItem {
  solution: Solution;
  code: SolutionAccentCode;
  status: SolutionStatus;
  visual: (typeof SOLUTION_VISUALS)[SolutionAccentCode];
}
interface DashboardSnapshot {
  businessId: string;
  workspaceItems: WorkspaceSolutionItem[];
  connections: Connection[];
  billing: BillingInfo | null;
  leads: Lead[];
  posts: Post[];
}
export function useDashboardData() {
  const { user, isLoading: userLoading, error: userError } = useCurrentUser();
  const {
    business,
    businessId,
    businesses,
    isLoading: businessLoading,
    setBusinessId,
    error: businessError,
  } = useCurrentBusiness();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [failure, setFailure] = useState<{
    businessId: string;
    message: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (businessLoading || !business) return;
    let cancelled = false;
    async function load() {
      try {
        const [catalog, installed, connections, billing, leads, posts] =
          await Promise.all([
            getSolutions(),
            getBusinessSolutions(businessId),
            getConnections(businessId),
            getBilling(businessId),
            getRecentLeads(businessId, 4),
            getScheduledPosts(businessId, 2),
          ]);
        if (cancelled) return;
        const statuses = new Map(
          installed.map((item) => [item.solutionId, item.status]),
        );
        const workspaceItems = WORKSPACE_SOLUTION_ORDER.flatMap((code) => {
          const solution = catalog.find((item) => item.code === code);
          return solution
            ? [
                {
                  solution,
                  code,
                  status:
                    statuses.get(solution.id) ??
                    ("available" as SolutionStatus),
                  visual: SOLUTION_VISUALS[code],
                },
              ]
            : [];
        });
        setSnapshot({
          businessId,
          workspaceItems,
          connections,
          billing,
          leads,
          posts,
        });
        setFailure(null);
      } catch {
        if (!cancelled)
          setFailure({
            businessId,
            message:
              "Не удалось загрузить рабочее пространство. Попробуйте ещё раз.",
          });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [businessId, business, businessLoading, attempt]);
  const current = snapshot?.businessId === businessId ? snapshot : null;
  const error =
    businessError ||
    userError ||
    (failure?.businessId === businessId ? failure.message : null);
  const workspaceItems = current?.workspaceItems ?? [];
  return {
    user,
    business,
    businessId,
    businesses,
    setBusinessId,
    workspaceItems,
    connections: current?.connections ?? [],
    billing: current?.billing ?? null,
    leads: current?.leads ?? [],
    posts: current?.posts ?? [],
    activeSolutionsCount: workspaceItems.filter(
      (item) => item.status === "active",
    ).length,
    isLoading: !error && (userLoading || businessLoading || !current),
    error,
    retry: () => {
      setFailure(null);
      setAttempt((value) => value + 1);
    },
  };
}
