"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_BUSINESS_ID } from "@/mocks/businesses";
import { getBusinesses } from "@/services/business.service";
import type { Business } from "@/types";

interface BusinessContextValue {
  businesses: Business[];
  currentBusiness: Business | null;
  currentBusinessId: string;
  isLoading: boolean;
  setCurrentBusinessId: (id: string) => void;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

const STORAGE_KEY = "sreda.currentBusinessId";

function readStoredBusinessId(): string {
  if (typeof window === "undefined") return DEFAULT_BUSINESS_ID;
  return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_BUSINESS_ID;
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [currentBusinessId, setCurrentBusinessIdState] =
    useState(DEFAULT_BUSINESS_ID);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      const list = await getBusinesses();
      if (cancelled) return;

      setBusinesses(list);
      const storedId = readStoredBusinessId();
      const exists = list.some((business) => business.id === storedId);
      setCurrentBusinessIdState(exists ? storedId : (list[0]?.id ?? DEFAULT_BUSINESS_ID));
      setIsLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrentBusinessId = useCallback((id: string) => {
    setCurrentBusinessIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const currentBusiness = useMemo(
    () => businesses.find((business) => business.id === currentBusinessId) ?? null,
    [businesses, currentBusinessId],
  );

  const value = useMemo(
    () => ({
      businesses,
      currentBusiness,
      currentBusinessId,
      isLoading,
      setCurrentBusinessId,
    }),
    [
      businesses,
      currentBusiness,
      currentBusinessId,
      isLoading,
      setCurrentBusinessId,
    ],
  );

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusinessContext(): BusinessContextValue {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error("useBusinessContext must be used within BusinessProvider");
  }
  return context;
}
