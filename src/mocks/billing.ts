import type { BillingInfo } from "@/types";

export const mockBilling: BillingInfo[] = [
  {
    businessId: "biz_zerno",
    planName: "Базовый",
    pricePerMonth: 500,
    activeSolutionsCount: 2,
    status: "active",
    nextChargeAt: "2026-10-10T00:00:00+03:00",
  },
  {
    businessId: "biz_boroda",
    planName: "Базовый",
    pricePerMonth: 250,
    activeSolutionsCount: 1,
    status: "active",
    nextChargeAt: "2026-10-05T00:00:00+03:00",
  },
];
