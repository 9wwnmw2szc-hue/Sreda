"use client";

import { useBusinessContext } from "./useBusinessContext";

/** Текущий бизнес пользователя (архитектура User → Business). */
export function useCurrentBusiness() {
  const {
    currentBusiness,
    currentBusinessId,
    isLoading,
    setCurrentBusinessId,
    businesses,
    error,
  } = useBusinessContext();

  return {
    business: currentBusiness,
    businessId: currentBusinessId,
    businesses,
    error,
    isLoading,
    setBusinessId: setCurrentBusinessId,
  };
}
