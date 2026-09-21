/**
 * Shared currency formatting for Web / bots / orders / catalog.
 * Never mix currencies into one aggregate outside analytics helpers.
 */

const SYMBOLS: Record<string, string> = {
  RUB: "₽",
  USD: "$",
  EUR: "€",
  KZT: "₸",
  UAH: "₴",
  BYN: "Br",
};

export function normalizeCurrency(currency?: string | null): string {
  const raw = (currency || "RUB").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : "RUB";
}

export function formatMoney(
  amount: number | string | null | undefined,
  currency: string | null | undefined = "RUB",
): string {
  const code = normalizeCurrency(currency);
  const n =
    typeof amount === "string"
      ? Number(amount.replace(",", "."))
      : Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(safe) ? 0 : 2,
  }).format(safe);
  const symbol = SYMBOLS[code];
  return symbol ? `${formatted} ${symbol}` : `${formatted} ${code}`;
}

/** Analytics-compatible alias (same rules). */
export { formatMoney as formatMoneyAmount };
