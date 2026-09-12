"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  refreshBusinesses: (preferredId?: string) => Promise<void>;
}
const BusinessContext = createContext<BusinessContextValue | null>(null);
export function BusinessProvider({ children, user }: { children: ReactNode; user: User }) {
  const storageKey = "sreda.currentBusinessId:" + user.id;
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [currentBusinessId, setCurrentBusinessIdState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selected = useRef("");
  const sequence = useRef(0);
  const mounted = useRef(true);
  const refreshBusinesses = useCallback(async (preferredId?: string) => {
    if (preferredId) selected.current = preferredId;
    const request = ++sequence.current;
    try {
      const list = await getBusinesses();
      if (!mounted.current || request !== sequence.current) return;
      let stored: string | null = null;
      try { stored = localStorage.getItem(storageKey); } catch { /* optional preference */ }
      const candidates = [preferredId, selected.current, stored];
      const id = candidates.find((candidate) => list.some((item) => item.id === candidate)) ?? list[0]?.id ?? "";
      selected.current = id;
      setBusinesses(list);
      setCurrentBusinessIdState(id);
      setError(list.length ? null : "У вас пока нет бизнесов.");
      try { localStorage.setItem(storageKey, id); } catch { /* optional preference */ }
    } catch (cause) {
      if (!mounted.current || request !== sequence.current) return;
      // Do not continue showing cached rights after a failed access refresh.
      setBusinesses([]);
      setCurrentBusinessIdState("");
      setError("Не удалось проверить доступ к вашим бизнесам. Попробуйте обновить список.");
      throw cause;
    } finally {
      if (mounted.current && request === sequence.current) setIsLoading(false);
    }
  }, [storageKey]);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => { if (document.visibilityState === "visible") void refreshBusinesses().catch(() => undefined); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      mounted.current = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [refreshBusinesses]);
  const setCurrentBusinessId = useCallback(
    (id: string) => {
      if (!businesses.some((item) => item.id === id)) return;
      selected.current = id;
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
      refreshBusinesses,
    }),
    [
      user,
      businesses,
      currentBusiness,
      currentBusinessId,
      isLoading,
      error,
      setCurrentBusinessId,
      refreshBusinesses,
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
