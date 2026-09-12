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
import type { Business, User } from "@/types";
interface BusinessContextValue {
  user: User;
  businesses: Business[];
  currentBusiness: Business | null;
  currentBusinessId: string;
  isLoading: boolean;
  error: string | null;
  setCurrentBusinessId: (id: string) => void;
}
const BusinessContext = createContext<BusinessContextValue | null>(null);
export function BusinessProvider({ children, user }: { children: ReactNode; user: User }) {
  const storageKey = "sreda.currentBusinessId:" + user.id;
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
          stored = localStorage.getItem(storageKey);
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
  }, [storageKey]);
  const setCurrentBusinessId = useCallback(
    (id: string) => {
      if (!businesses.some((item) => item.id === id)) return;
      setCurrentBusinessIdState(id);
      try {
        localStorage.setItem(storageKey, id);
      } catch {
        /* preferences are optional */
      }
    },
    [businesses, storageKey],
  );
  const currentBusiness = useMemo(
    () => businesses.find((item) => item.id === currentBusinessId) ?? null,
    [businesses, currentBusinessId],
  );
  const value = useMemo(
    () => ({
      user,
      businesses,
      currentBusiness,
      currentBusinessId,
      isLoading,
      error,
      setCurrentBusinessId,
    }),
    [
      user,
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
