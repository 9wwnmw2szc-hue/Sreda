/** Russian-facing number/date formatters for analytics UI and exports. */

export { formatMoney } from "@/lib/money";

export function formatCount(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Number.isFinite(n) ? n : 0);
}

export function formatPercent(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(n)}%`;
}

export function formatDeltaLabel(delta: {
  absolute: number;
  percent: number | null;
}): string {
  if (delta.percent === null && delta.absolute !== 0)
    return `${delta.absolute > 0 ? "+" : ""}${formatCount(delta.absolute)} (нет базы)`;
  if (delta.percent === null) return "без изменений";
  return `${formatPercent(delta.percent)} к предыдущему периоду`;
}

/** Prefix formula-like cells so spreadsheet apps do not execute them. */
export function escapeSpreadsheetCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(raw) || raw.startsWith("\t")) return `'${raw}`;
  return raw;
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const escaped = escapeSpreadsheetCell(cell).replace(/"/g, '""');
          return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
        })
        .join(","),
    )
    .join("\n");
}
