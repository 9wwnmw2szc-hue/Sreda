import type { Business } from "@/types";

export const mockBusinesses: Business[] = [
  {
    id: "biz_zerno",
    ownerId: "user_1",
    name: "ООО «КавкаХей»",
    planName: "Базовый",
  },
  {
    id: "biz_boroda",
    ownerId: "user_1",
    name: "Студия красоты «Александрия»",
    planName: "Базовый",
  },
  {
    id: "biz_long",
    ownerId: "user_1",
    name:
      "Центр профессиональной подготовки и повышения квалификации «Северо-Западный образовательный холдинг»",
    planName: "Базовый",
  },
];

export const DEFAULT_BUSINESS_ID = "biz_zerno";
