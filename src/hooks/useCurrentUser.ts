"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/services/user.service";
import type { User } from "@/types";

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const data = await getCurrentUser();
      if (cancelled) return;
      setUser(data);
      setIsLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { user, isLoading };
}
