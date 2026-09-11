import type { Connection } from "@/types";

export const mockConnections: Connection[] = [
  {
    id: "conn_tg_zerno",
    businessId: "biz_zerno",
    platform: "telegram",
    status: "connected",
    displayName: "@zerno_coffee_bot",
  },
  {
    id: "conn_vk_zerno",
    businessId: "biz_zerno",
    platform: "vk",
    status: "connected",
    displayName: "Кофейня «Зерно»",
  },
  {
    id: "conn_tg_boroda",
    businessId: "biz_boroda",
    platform: "telegram",
    status: "connected",
    displayName: "@boroda_barber_bot",
  },
];
