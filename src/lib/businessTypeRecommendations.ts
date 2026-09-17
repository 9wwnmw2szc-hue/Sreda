export type BusinessType = "store" | "service" | "hybrid";

/** Soft catalog hints by business type — never locks other solutions. */
export function recommendedSolutionCodes(
  businessType: BusinessType | string | null | undefined,
): string[] {
  switch (businessType) {
    case "store":
      return ["orders"];
    case "service":
      return ["booking", "leads"];
    case "hybrid":
      return ["orders", "booking", "leads"];
    default:
      return [];
  }
}

const LABELS: Record<string, string> = {
  orders: "Заказы",
  booking: "Запись",
  leads: "Заявки",
};

export function recommendationSummary(
  businessType: BusinessType | string | null | undefined,
): string {
  const codes = recommendedSolutionCodes(businessType);
  if (!codes.length) return "";
  const names = codes.map((code) => LABELS[code] ?? code);
  if (names.length === 1) return `Для вашего типа бизнеса рекомендуем «${names[0]}».`;
  if (names.length === 2)
    return `Для вашего типа бизнеса рекомендуем «${names[0]}» и «${names[1]}».`;
  return `Для вашего типа бизнеса рекомендуем «${names.slice(0, -1).join("», «")}» и «${names.at(-1)}».`;
}
