import {
  PRODUCT_SOLUTIONS,
  productSolutionByCode,
} from "../../lib/productSolutions.ts";
import type { SolutionEntitlement, BillingSummary } from "./types.ts";

/**
 * Build an honest billing summary from entitlements + product catalog.
 * Does not claim payment success or invent next charge dates.
 */
export function buildBillingSummary(
  businessId: string,
  entitlements: readonly SolutionEntitlement[],
): BillingSummary {
  const byCode = new Map(
    entitlements.map((item) => [item.solutionCode, item]),
  );

  const lines = PRODUCT_SOLUTIONS.map((product) => {
    const entitlement = byCode.get(product.code);
    return {
      solutionCode: product.code,
      name: product.name,
      priceRub: product.price,
      entitled: entitlement?.entitled ?? false,
      entitlementStatus: entitlement?.status ?? ("absent" as const),
      ...(product.messageLimit ? { messageLimit: product.messageLimit } : {}),
    };
  });

  const entitled = lines.filter((line) => line.entitled);
  const estimatedMonthlyRub = entitled.reduce(
    (sum, line) => sum + line.priceRub,
    0,
  );

  return {
    businessId,
    lines,
    entitledCount: entitled.length,
    estimatedMonthlyRub,
    paymentConnected: false,
    statusLabel:
      entitled.length > 0
        ? "Решения подключены · оплата не подключена"
        : "Решения не подключены · оплата не подключена",
    nextStep: "Подключение оплаты — следующий шаг",
  };
}

export function estimatedPriceRubForCodes(codes: readonly string[]): number {
  let total = 0;
  for (const code of codes) {
    const product = productSolutionByCode(code);
    if (product) total += product.price;
  }
  return total;
}
