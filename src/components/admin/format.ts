const dateTime = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "short",
});

const dateOnly = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
});

export function formatDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(+d)) return "—";
  return dateTime.format(d);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(+d)) return "—";
  return dateOnly.format(d);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ru-RU").format(value);
}

export const SOLUTION_LABELS: Record<string, string> = {
  orders: "Заказы",
  leads: "Заявки",
  booking: "Записи",
  admin_messages: "Сообщения",
  autopost: "Автопостинг",
  sales: "Заказы",
};

export function solutionLabel(code: string): string {
  return SOLUTION_LABELS[code] ?? code;
}
