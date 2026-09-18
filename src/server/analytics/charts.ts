/** Shared chart specification — used by Analytics UI and AI analyst. */

export type ChartKind = "line" | "bar" | "stacked_bar" | "donut";

export type ChartSeries = {
  key: string;
  label: string;
  values: number[];
};

export type ChartSpec = {
  id: string;
  kind: ChartKind;
  title: string;
  emptyMessage?: string;
  categories: string[];
  series: ChartSeries[];
  unit?: "count" | "money" | "percent";
  currency?: string;
  explanation?: string;
};

export function emptyChart(
  id: string,
  title: string,
  message: string,
): ChartSpec {
  return {
    id,
    kind: "line",
    title,
    emptyMessage: message,
    categories: [],
    series: [],
  };
}

/** Donut only for small part-to-whole sets. */
export function preferDonut(partCount: number): boolean {
  return partCount >= 2 && partCount <= 6;
}
