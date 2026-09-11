import type { Business } from "@/types";

export const mockBusinesses: Business[] = [
  {
    id: "biz_zerno",
    ownerId: "user_1",
    name: "Кофейня «Зерно»",
    planName: "Базовый",
  },
  {
    id: "biz_boroda",
    ownerId: "user_1",
    name: "Барбершоп «Борода»",
    planName: "Базовый",
  },
];

export const DEFAULT_BUSINESS_ID = "biz_zerno";
