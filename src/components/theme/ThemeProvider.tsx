"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/config/brand";

type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (value: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const raw =
    window.localStorage.getItem(THEME_STORAGE_KEY) ??
    window.localStorage.getItem("soty.theme");
  if (raw === "light" || raw === "dark" || raw === "system") {
    if (window.localStorage.getItem(THEME_STORAGE_KEY) !== raw) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, raw);
      } catch {
        /* ignore */
      }
    }
    return raw;
  }
  return "system";
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyDom(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

function subscribeSystem(onStoreChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSystemSnapshot() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getServerSnapshot(): ResolvedTheme {
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof window === "undefined" ? "system" : readStored(),
  );
  const systemTheme = useSyncExternalStore(
    subscribeSystem,
    getSystemSnapshot,
    getServerSnapshot,
  );
  const resolved: ResolvedTheme =
    preference === "system" ? systemTheme : preference;

  useEffect(() => {
    applyDom(resolved);
  }, [resolved]);

  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
    applyDom(resolve(value));
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
