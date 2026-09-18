import { AppError } from "../../http/errors.ts";
import { ANALYTICS_LIMITS, limitLabel } from "../limits.ts";
import type { DataFileType } from "../schema.ts";

const ZIP_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK..

export function detectDataFile(
  filename: string,
  declaredMime: string,
  bytes: Uint8Array,
): { fileType: DataFileType; mime: string } {
  if (!bytes.length)
    throw new AppError(400, "EMPTY_FILE", "Файл пустой.");
  if (bytes.length > ANALYTICS_LIMITS.maxFileBytes)
    throw new AppError(
      413,
      "FILE_TOO_LARGE",
      `Файл слишком большой для анализа. Максимальный размер — ${limitLabel(ANALYTICS_LIMITS.maxFileBytes)}.`,
    );

  const name = filename.toLowerCase();
  const buf = Buffer.from(bytes);
  const isZip = buf.subarray(0, 4).equals(ZIP_SIG);
  const isCsv =
    !buf.includes(0) &&
    !buf.toString("utf8").includes("\uFFFD") &&
    (name.endsWith(".csv") ||
      declaredMime.includes("csv") ||
      declaredMime === "text/plain");

  if (name.endsWith(".xlsx") || declaredMime.includes("spreadsheetml")) {
    if (!isZip)
      throw new AppError(
        400,
        "INVALID_FILE",
        "Файл не похож на корректный .xlsx.",
      );
    return {
      fileType: "xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }
  if (name.endsWith(".xls"))
    throw new AppError(
      400,
      "UNSUPPORTED_FORMAT",
      "Формат .xls не поддерживается. Сохраните файл как .xlsx или .csv.",
    );
  if (isCsv || name.endsWith(".csv")) {
    return { fileType: "csv", mime: "text/csv" };
  }
  throw new AppError(
    400,
    "UNSUPPORTED_FORMAT",
    "Поддерживаются только .xlsx и .csv.",
  );
}
