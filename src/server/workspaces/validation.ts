import { AppError } from "../http/errors.ts";

export type BusinessType = "store" | "service" | "hybrid";

const BUSINESS_TYPES: BusinessType[] = ["store", "service", "hybrid"];

export function parseBusinessType(value: unknown): BusinessType {
  if (value === undefined || value === null || value === "") return "hybrid";
  if (typeof value === "string" && BUSINESS_TYPES.includes(value as BusinessType)) {
    return value as BusinessType;
  }
  throw new AppError(
    400,
    "INVALID_BUSINESS_TYPE",
    "Тип бизнеса: магазин, услуги или смешанный.",
  );
}

export function parseBusiness(input: Record<string, unknown>) {
  if (
    Object.keys(input).some(
      (key) => !["name", "timezone", "business_type"].includes(key),
    )
  ) {
    throw new AppError(400, "INVALID_FIELDS", "Переданы неизвестные поля.");
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const timezone = typeof input.timezone === "string" ? input.timezone : "";
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new AppError(
      400,
      "INVALID_NAME",
      "Название должно содержать от 1 до 100 символов.",
    );
  }
  try {
    if (!timezone || timezone.length > 100) throw new Error();
    new Intl.DateTimeFormat("ru", { timeZone: timezone });
  } catch {
    throw new AppError(400, "INVALID_TIMEZONE", "Выберите часовой пояс.");
  }
  return {
    name,
    timezone,
    business_type: parseBusinessType(input.business_type),
  };
}

export function requireIdempotencyKey(key: string | null) {
  if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) {
    throw new AppError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Обновите страницу и повторите создание.",
    );
  }
  return key;
}

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
