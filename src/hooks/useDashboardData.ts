"use client";

import { useEffect, useMemo, useState } from "react";
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

export function useDashboardData() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const {
    business,
    businessId,
    businesses,
    isLoading: businessLoading,
    setBusinessId,
  } = useCurrentBusiness();

  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [workspaceItems, setWorkspaceItems] = useState<WorkspaceSolutionItem[]>(
    [],
  );
  const [connections, setConnections] = useState<Connection[]>([]);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);

      const [
        catalog,
        businessSolutions,
        nextConnections,
        nextBilling,
        nextLeads,
        nextPosts,
      ] = await Promise.all([
        getSolutions(),
        getBusinessSolutions(businessId),
        getConnections(businessId),
        getBilling(businessId),
        getRecentLeads(businessId, 4),
        getScheduledPosts(businessId, 3),
      ]);

      if (cancelled) return;

      const statusBySolutionId = new Map(
        businessSolutions.map((item) => [item.solutionId, item.status]),
      );

      const items: WorkspaceSolutionItem[] = WORKSPACE_SOLUTION_ORDER.flatMap(
        (code) => {
          const solution = catalog.find((item) => item.code === code);
          if (!solution) return [];
          const visual = SOLUTION_VISUALS[code];
          return [
            {
              solution,
              code,
              status: statusBySolutionId.get(solution.id) ?? "available",
              visual,
            },
          ];
        },
      );

      setSolutions(catalog);
      setWorkspaceItems(items);
      setConnections(nextConnections);
      setBilling(nextBilling);
      setLeads(nextLeads);
      setPosts(nextPosts);
      setIsLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const activeSolutionsCount = useMemo(
    () => workspaceItems.filter((item) => item.status === "active").length,
    [workspaceItems],
  );

  return {
    user,
    business,
    businessId,
    businesses,
    setBusinessId,
    solutions,
    workspaceItems,
    connections,
    billing,
    leads,
    posts,
    activeSolutionsCount,
    isLoading: isLoading || userLoading || businessLoading,
  };
}
