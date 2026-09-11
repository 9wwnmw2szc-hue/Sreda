"use client";
import { useEffect, useState } from "react";
import { getCurrentUser } from "@/services/user.service";
import type { User } from "@/types";
export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getCurrentUser()
      .then((data) => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить профиль.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { user, isLoading, error };
}
