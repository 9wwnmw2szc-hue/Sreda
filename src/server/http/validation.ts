import { AppError } from "./errors.ts";
export function requireUuid(value: string) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new AppError(400, "INVALID_ID", "Некорректный идентификатор.");
}
