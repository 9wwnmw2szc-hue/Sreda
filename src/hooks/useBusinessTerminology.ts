"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import {
  terminologyFor,
  type Terminology,
} from "@/lib/industryPresets";

const DEFAULT = terminologyFor(null);

/** Load presentation labels (Мастер / Преподаватель / …) for the business industry. */
export function useBusinessTerminology(businessId: string | undefined) {
  const [terms, setTerms] = useState<Terminology>(DEFAULT);
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    void apiRequest<{
      industry?: string | null;
      preset?: { terminology?: Terminology } | null;
    }>(`/api/v1/businesses/${encodeURIComponent(businessId)}/industry`)
      .then((row) => {
        if (!active) return;
        setTerms(row.preset?.terminology ?? terminologyFor(row.industry));
      })
      .catch(() => {
        /* keep DEFAULT */
      });
    return () => {
      active = false;
    };
  }, [businessId]);
  return businessId ? terms : DEFAULT;
}
