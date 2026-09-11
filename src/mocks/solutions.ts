import type { BusinessSolution, Solution } from "@/types";

export const mockSolutions: Solution[] = [
  {
    id: "sol_leads",
    code: "leads",
    name: "Приём заявок",
    description:
      "Собирает обращения клиентов из Telegram и ВКонтакте.",
    price: 250,
  },
  {
    id: "sol_sales",
    code: "sales",
    name: "Продажи",
    description: "Каталог товаров и приём заказов.",
    price: 250,
  },
  {
    id: "sol_autopost",
    code: "autopost",
    name: "Автопостинг",
    description:
      "Публикует контент одновременно в Telegram и ВКонтакте.",
    price: 250,
  },
  {
    id: "sol_booking",
    code: "booking",
    name: "Онлайн-запись",
    description: "Позволяет клиентам самостоятельно выбирать время.",
    price: 250,
  },
];

export const mockBusinessSolutions: BusinessSolution[] = [
  {
    id: "bs_1",
    businessId: "biz_zerno",
    solutionId: "sol_leads",
    status: "active",
  },
  {
    id: "bs_2",
    businessId: "biz_zerno",
    solutionId: "sol_sales",
    status: "available",
  },
  {
    id: "bs_3",
    businessId: "biz_zerno",
    solutionId: "sol_autopost",
    status: "active",
  },
  {
    id: "bs_4",
    businessId: "biz_zerno",
    solutionId: "sol_booking",
    status: "available",
  },
  {
    id: "bs_5",
    businessId: "biz_boroda",
    solutionId: "sol_leads",
    status: "active",
  },
];
