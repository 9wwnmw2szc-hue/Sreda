import {
  PRODUCT_SOLUTIONS,
  productSolutionByCode,
} from "@/lib/productSolutions";

export type BusinessType = "store" | "service" | "hybrid";

/** Soft catalog hints by business type — never locks other solutions. */
export function recommendedSolutionCodes(
  businessType: BusinessType | string | null | undefined,
): string[] {
  switch (businessType) {
    case "store":
      return ["orders", "admin_messages", "autopost"];
    case "service":
      return ["leads", "booking", "admin_messages", "autopost"];
    case "hybrid":
      return PRODUCT_SOLUTIONS.map((item) => item.code);
    default:
      return [];
  }
}

export function recommendationSummary(
  businessType: BusinessType | string | null | undefined,
): string {
  const codes = recommendedSolutionCodes(businessType);
  if (!codes.length) return "";
  const names = codes.map(
    (code) => productSolutionByCode(code)?.name ?? code,
  );
  if (names.length === 1)
    return `Для вашего типа бизнеса рекомендуем «${names[0]}».`;
  if (names.length === 2)
    return `Для вашего типа бизнеса рекомендуем «${names[0]}» и «${names[1]}».`;
  return `Для вашего типа бизнеса рекомендуем «${names.slice(0, -1).join("», «")}» и «${names.at(-1)}».`;
}
