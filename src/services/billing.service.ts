import { isDemoMode } from "@/lib/dataMode";
import { delay } from "@/lib/delay";
import {
  formatSolutionPrice,
  PRODUCT_SOLUTIONS,
  productSolutionByCode,
} from "@/lib/productSolutions";
import { mockBilling } from "@/mocks/billing";
import { getBusinessSolutions } from "@/services/solutions.service";
import type { BillingInfo, BusinessSolution } from "@/types";

function summarizeFromInstalled(
  businessId: string,
  installed: BusinessSolution[],
): BillingInfo {
  const active = installed.filter(
    (item) => item.status === "active" || item.status === "setup_required",
  );
  let pricePerMonth = 0;
  for (const item of active) {
    const code = item.solutionId.replace(/^sol_/, "");
    const product = productSolutionByCode(code);
    if (product) pricePerMonth += product.price;
  }
  const entitledCount = active.length;
  return {
    businessId,
    planName: "По решениям",
    pricePerMonth,
    activeSolutionsCount: entitledCount,
    status: entitledCount > 0 ? "unpaid" : "paused",
    nextChargeAt: null,
    paymentConnected: false,
    statusLabel:
      entitledCount > 0
        ? "Решения подключены · оплата не подключена"
        : "Решения не подключены · оплата не подключена",
    nextStep: "Подключение оплаты — следующий шаг",
  };
}

export async function getBilling(
  businessId: string,
): Promise<BillingInfo | null> {
  if (isDemoMode) {
    await delay();
    const demo = mockBilling.find((item) => item.businessId === businessId);
    if (!demo) return null;
    return {
      ...demo,
      nextChargeAt: demo.nextChargeAt ?? null,
      paymentConnected: false,
      status: "unpaid",
      statusLabel: "Демо · оплата не подключена",
      nextStep: "Подключение оплаты — следующий шаг",
    };
  }
  const installed = await getBusinessSolutions(businessId);
  return summarizeFromInstalled(businessId, installed);
}

export function catalogBillingLines() {
  return PRODUCT_SOLUTIONS.map((item) => ({
    code: item.code,
    name: item.name,
    priceLabel: formatSolutionPrice(item.price, item.messageLimit),
    price: item.price,
  }));
}
