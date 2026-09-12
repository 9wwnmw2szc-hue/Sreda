"use client";
import { useBusinessContext } from "./useBusinessContext";
export function useCurrentUser() {
  const { user } = useBusinessContext();
  return { user, isLoading: false, error: null };
}
