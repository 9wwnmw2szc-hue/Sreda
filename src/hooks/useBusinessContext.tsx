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
import { getBusinesses } from "@/services/business.service";
import type { Business } from "@/types";
interface BusinessContextValue {
  businesses: Business[];
  currentBusiness: Business | null;
  currentBusinessId: string;
  isLoading: boolean;
  error: string | null;
  setCurrentBusinessId: (id: string) => void;
}
const BusinessContext = createContext<BusinessContextValue | null>(null);
const STORAGE_KEY = "sreda.currentBusinessId";
export function BusinessProvider({ children }: { children: ReactNode }) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [currentBusinessId, setCurrentBusinessIdState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getBusinesses()
      .then((list) => {
        if (cancelled) return;
        let stored: string | null = null;
        try {
          stored = localStorage.getItem(STORAGE_KEY);
        } catch {
          /* preferences are optional */
        }
        setBusinesses(list);
        setCurrentBusinessIdState(
          list.some((item) => item.id === stored)
            ? stored!
            : (list[0]?.id ?? ""),
        );
        if (!list.length) setError("У вас пока нет бизнесов.");
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить ваши бизнесы.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const setCurrentBusinessId = useCallback(
    (id: string) => {
      if (!businesses.some((item) => item.id === id)) return;
      setCurrentBusinessIdState(id);
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        /* preferences are optional */
      }
    },
    [businesses],
  );
  const currentBusiness = useMemo(
    () => businesses.find((item) => item.id === currentBusinessId) ?? null,
    [businesses, currentBusinessId],
  );
  const value = useMemo(
    () => ({
      businesses,
      currentBusiness,
      currentBusinessId,
      isLoading,
      error,
      setCurrentBusinessId,
    }),
    [
      businesses,
      currentBusiness,
      currentBusinessId,
      isLoading,
      error,
      setCurrentBusinessId,
    ],
  );
  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
}
export function useBusinessContext() {
  const context = useContext(BusinessContext);
  if (!context) throw new Error("BusinessProvider is required");
  return context;
}
