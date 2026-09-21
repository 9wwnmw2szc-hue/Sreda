import type { BillingInfo } from "@/types";

export const mockBilling: BillingInfo[] = [
  {
    businessId: "biz_zerno",
    planName: "По решениям",
    pricePerMonth: 500,
    activeSolutionsCount: 2,
    status: "unpaid",
    nextChargeAt: null,
    paymentConnected: false,
    statusLabel: "Демо · оплата не подключена",
    nextStep: "Подключение оплаты — следующий шаг",
  },
  {
    businessId: "biz_boroda",
    planName: "По решениям",
    pricePerMonth: 250,
    activeSolutionsCount: 1,
    status: "unpaid",
    nextChargeAt: null,
    paymentConnected: false,
    statusLabel: "Демо · оплата не подключена",
    nextStep: "Подключение оплаты — следующий шаг",
  },
];
