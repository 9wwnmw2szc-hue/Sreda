"use client";

import { useEffect, type ReactNode } from "react";

/** Keep public landing light regardless of app theme / OS preference. */
export function LandingForceLight({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const prevTheme = root.dataset.theme;
    const prevScheme = root.style.colorScheme;
    root.dataset.theme = "light";
    root.style.colorScheme = "light";
    root.dataset.landing = "1";
    return () => {
      delete root.dataset.landing;
      if (prevTheme) root.dataset.theme = prevTheme;
      else delete root.dataset.theme;
      root.style.colorScheme = prevScheme;
    };
  }, []);

  return <>{children}</>;
}
