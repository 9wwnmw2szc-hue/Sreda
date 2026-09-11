/** Форматирование дат и имён для UI (без бизнес-логики). */

const DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function getFirstName(fullName: string): string {
  const [first] = fullName.trim().split(/\s+/);
  return first || fullName;
}

export function getGreeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

export function formatRelativeDateTime(
  iso: string,
  now = new Date(),
): string {
  const date = new Date(iso);
  const today = startOfDay(now);
  const target = startOfDay(date);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  const time = TIME_FORMATTER.format(date);

  if (diffDays === 0) return `Сегодня, ${time}`;
  if (diffDays === -1) return `Вчера, ${time}`;
  if (diffDays === 1) return `Завтра, ${time}`;

  return DATE_FORMATTER.format(date);
}

export function formatMoneyRub(amount: number): string {
  return `${amount.toLocaleString("ru-RU")} ₽/мес.`;
}

export function initialsFromName(name: string): string {
  const cleaned = name.replace(/[«»“”"']/g, " ").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}
