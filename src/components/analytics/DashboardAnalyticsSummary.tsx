"use client";
import { Suspense, use, useMemo } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/apiClient";

type Summary = {
  kpis: { id: string; label: string; display: string }[];
  href: string;
};

const cache = new Map<string, Promise<Summary>>();

function summaryPromise(businessId: string) {
  let p = cache.get(businessId);
  if (!p) {
    p = apiRequest<Summary>(
      `/api/v1/businesses/${businessId}/analytics/summary`,
    ).catch(() => ({ kpis: [], href: "/analytics" }));
    cache.set(businessId, p);
  }
  return p;
}

function SummaryBody({ businessId }: { businessId: string }) {
  const data = use(summaryPromise(businessId));
  const kpis = useMemo(() => data.kpis ?? [], [data.kpis]);
  if (!kpis.length) return null;
  return (
    <section className="analytics-summary" aria-label="Краткая аналитика">
      <div className="analytics-summary__kpis">
        {kpis.map((kpi) => (
          <div key={kpi.id}>
            <p className="text-caption">{kpi.label}</p>
            <p className="analytics-kpi__value">{kpi.display}</p>
          </div>
        ))}
      </div>
      <Link className="button button--outline" href={data.href}>
        Открыть аналитику
      </Link>
    </section>
  );
}

export function DashboardAnalyticsSummary({
  businessId,
}: {
  businessId: string;
}) {
  return (
    <Suspense fallback={null}>
      <SummaryBody businessId={businessId} />
    </Suspense>
  );
}
