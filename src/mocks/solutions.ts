import { PRODUCT_SOLUTIONS } from "@/lib/productSolutions";
import type { BusinessSolution, Solution } from "@/types";

export const mockSolutions: Solution[] = PRODUCT_SOLUTIONS.map((item) => ({
  id: item.id,
  code: item.code,
  name: item.name,
  description: item.description,
  price: item.price,
}));

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
    solutionId: "sol_admin_messages",
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
  {
    id: "bs_6",
    businessId: "biz_zerno",
    solutionId: "sol_orders",
    status: "available",
  },
];
