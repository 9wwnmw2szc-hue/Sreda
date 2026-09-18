import {
  PRODUCT_SOLUTIONS,
  productSolutionByCode,
} from "./productSolutions.ts";
import {
  recommendedSolutionsForIndustry,
  type IndustryId,
} from "./industryPresets.ts";

export type BusinessType = "store" | "service" | "hybrid";

/** Soft catalog hints — never locks other solutions. Prefer industry when set. */
export function recommendedSolutionCodes(
  businessType: BusinessType | string | null | undefined,
  industry?: IndustryId | string | null,
): string[] {
  const fromIndustry = recommendedSolutionsForIndustry(industry);
  if (fromIndustry.length) return fromIndustry;
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
  industry?: IndustryId | string | null,
): string {
  const codes = recommendedSolutionCodes(businessType, industry);
  if (!codes.length) return "";
  const names = codes.map(
    (code) => productSolutionByCode(code)?.name ?? code,
  );
  if (names.length === 1)
    return `Для вашего направления подойдёт «${names[0]}».`;
  if (names.length === 2)
    return `Для вашего направления подойдут «${names[0]}» и «${names[1]}».`;
  return `Для вашего направления подойдут «${names.slice(0, -1).join("», «")}» и «${names.at(-1)}».`;
}
