import ExcelJS from "exceljs";
import { AppError } from "../../http/errors.ts";
import { ANALYTICS_LIMITS } from "../limits.ts";
import type { ColumnProfile, ColumnType, DataFileType } from "../schema.ts";

export type ParsedSheet = {
  name: string;
  columns: ColumnProfile[];
  rows: (string | number | boolean | null)[][];
  quality: {
    emptyRows: number;
    duplicateHeaders: string[];
    issues: string[];
  };
};

export type ParsedWorkbook = {
  sheets: ParsedSheet[];
  totalRows: number;
};

function cellToValue(raw: unknown): string | number | boolean | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" || typeof raw === "boolean") return raw;
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "object" && raw && "result" in (raw as object))
    return cellToValue((raw as { result: unknown }).result);
  if (typeof raw === "object" && raw && "text" in (raw as object))
    return String((raw as { text: unknown }).text).slice(
      0,
      ANALYTICS_LIMITS.maxCellChars,
    );
  const text = String(raw).slice(0, ANALYTICS_LIMITS.maxCellChars);
  return text;
}

function inferType(values: (string | number | boolean | null)[]): ColumnType {
  const nonNull = values.filter((v) => v != null && v !== "");
  if (!nonNull.length) return "unknown";
  let dates = 0,
    ints = 0,
    decimals = 0,
    bools = 0,
    currency = 0,
    percent = 0;
  for (const v of nonNull) {
    if (typeof v === "boolean") bools++;
    else if (typeof v === "number") {
      if (Number.isInteger(v)) ints++;
      else decimals++;
    } else {
      const s = String(v).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(s))
        dates++;
      else if (/^-?\d+\s*₽|руб/i.test(s) || /^-?\d+[.,]\d{2}$/.test(s))
        currency++;
      else if (/%$/.test(s)) percent++;
      else if (/^-?\d+$/.test(s)) ints++;
      else if (/^-?\d+[.,]\d+$/.test(s)) decimals++;
    }
  }
  const n = nonNull.length;
  if (bools / n > 0.8) return "boolean";
  if (dates / n > 0.7) return "date";
  if (currency / n > 0.5) return "currency";
  if (percent / n > 0.5) return "percentage";
  if (ints / n > 0.8) return "integer";
  if ((ints + decimals) / n > 0.8) return "decimal";
  const unique = new Set(nonNull.map(String)).size;
  if (unique <= Math.min(20, Math.ceil(n * 0.3)) && n >= 8) return "category";
  return "text";
}

function profileColumns(
  headers: string[],
  rows: (string | number | boolean | null)[][],
): ColumnProfile[] {
  return headers.map((name, idx) => {
    const col = rows.map((r) => r[idx] ?? null);
    const nonNull = col.filter((v) => v != null && v !== "");
    const unique = new Set(nonNull.map(String));
    const nums = nonNull
      .map((v) => (typeof v === "number" ? v : Number(String(v).replace(",", "."))))
      .filter((n) => Number.isFinite(n));
    return {
      name: name || `Колонка ${idx + 1}`,
      inferredType: inferType(col),
      nonNullCount: nonNull.length,
      nullCount: col.length - nonNull.length,
      uniqueCount: unique.size <= 500 ? unique.size : null,
      min: nums.length ? Math.min(...nums) : null,
      max: nums.length ? Math.max(...nums) : null,
      samples: [...unique].slice(0, 5).map(String),
    };
  });
}

function parseCsv(text: string): ParsedSheet {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l, i, arr) => {
    if (i === arr.length - 1 && l === "") return false;
    return true;
  });
  if (!lines.length)
    return {
      name: "Лист 1",
      columns: [],
      rows: [],
      quality: { emptyRows: 0, duplicateHeaders: [], issues: ["Пустой файл"] },
    };

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };

  const headers = parseLine(lines[0]!).map((h) =>
    h.slice(0, ANALYTICS_LIMITS.maxCellChars),
  );
  if (headers.length > ANALYTICS_LIMITS.maxColumns)
    throw new AppError(
      400,
      "TOO_MANY_COLUMNS",
      `Слишком много столбцов. Максимум — ${ANALYTICS_LIMITS.maxColumns}.`,
    );

  const rows: (string | number | boolean | null)[][] = [];
  let emptyRows = 0;
  for (let i = 1; i < lines.length; i++) {
    if (rows.length >= ANALYTICS_LIMITS.maxRows)
      throw new AppError(
        400,
        "TOO_MANY_ROWS",
        `Слишком много строк. Максимум — ${ANALYTICS_LIMITS.maxRows}.`,
      );
    const cells = parseLine(lines[i]!).map((c) =>
      c === "" ? null : c.slice(0, ANALYTICS_LIMITS.maxCellChars),
    );
    if (cells.every((c) => c == null || c === "")) {
      emptyRows++;
      continue;
    }
    while (cells.length < headers.length) cells.push(null);
    rows.push(cells.slice(0, headers.length));
  }

  const dup = headers.filter((h, i) => h && headers.indexOf(h) !== i);
  return {
    name: "Лист 1",
    columns: profileColumns(headers, rows),
    rows,
    quality: {
      emptyRows,
      duplicateHeaders: [...new Set(dup)],
      issues: [
        ...(emptyRows ? [`Пустых строк: ${emptyRows}`] : []),
        ...(dup.length ? [`Повторяющиеся заголовки: ${[...new Set(dup)].join(", ")}`] : []),
      ],
    },
  };
}

async function parseXlsx(bytes: Uint8Array): Promise<ParsedSheet[]> {
  if (bytes.length > ANALYTICS_LIMITS.maxFileBytes)
    throw new AppError(413, "FILE_TOO_LARGE", "Файл слишком большой.");

  const workbook = new ExcelJS.Workbook();
  // exceljs reads cached formula values; we never evaluate formulas ourselves
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  const sheets: ParsedSheet[] = [];
  let totalRows = 0;

  if (workbook.worksheets.length > ANALYTICS_LIMITS.maxSheets)
    throw new AppError(
      400,
      "TOO_MANY_SHEETS",
      `Слишком много листов. Максимум — ${ANALYTICS_LIMITS.maxSheets}.`,
    );

  for (const ws of workbook.worksheets) {
    const matrix: (string | number | boolean | null)[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > ANALYTICS_LIMITS.maxRows + 1)
        throw new AppError(
          400,
          "TOO_MANY_ROWS",
          `Слишком много строк. Максимум — ${ANALYTICS_LIMITS.maxRows}.`,
        );
      const values: (string | number | boolean | null)[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > ANALYTICS_LIMITS.maxColumns)
          throw new AppError(
            400,
            "TOO_MANY_COLUMNS",
            `Слишком много столбцов. Максимум — ${ANALYTICS_LIMITS.maxColumns}.`,
          );
        while (values.length < colNumber - 1) values.push(null);
        values.push(cellToValue(cell.value));
      });
      matrix.push(values);
    });

    if (!matrix.length) {
      sheets.push({
        name: ws.name || `Лист ${sheets.length + 1}`,
        columns: [],
        rows: [],
        quality: {
          emptyRows: 0,
          duplicateHeaders: [],
          issues: ["Пустой лист"],
        },
      });
      continue;
    }

    const maxCols = Math.max(...matrix.map((r) => r.length), 0);
    if (maxCols > ANALYTICS_LIMITS.maxColumns)
      throw new AppError(
        400,
        "TOO_MANY_COLUMNS",
        `Слишком много столбцов. Максимум — ${ANALYTICS_LIMITS.maxColumns}.`,
      );

    const headers = Array.from({ length: maxCols }, (_, i) => {
      const v = matrix[0]![i];
      return v == null || v === "" ? `Колонка ${i + 1}` : String(v);
    });
    const dataRows = matrix.slice(1).map((r) => {
      const row = [...r];
      while (row.length < maxCols) row.push(null);
      return row.slice(0, maxCols);
    });
    let emptyRows = 0;
    const compact = dataRows.filter((r) => {
      if (r.every((c) => c == null || c === "")) {
        emptyRows++;
        return false;
      }
      return true;
    });
    totalRows += compact.length;
    if (totalRows > ANALYTICS_LIMITS.maxRows)
      throw new AppError(
        400,
        "TOO_MANY_ROWS",
        `Слишком много строк. Максимум — ${ANALYTICS_LIMITS.maxRows}.`,
      );

    const dup = headers.filter((h, i) => headers.indexOf(h) !== i);
    sheets.push({
      name: ws.name || `Лист ${sheets.length + 1}`,
      columns: profileColumns(headers, compact),
      rows: compact,
      quality: {
        emptyRows,
        duplicateHeaders: [...new Set(dup)],
        issues: [
          ...(emptyRows ? [`Пустых строк: ${emptyRows}`] : []),
          ...(dup.length
            ? [`Повторяющиеся заголовки: ${[...new Set(dup)].join(", ")}`]
            : []),
        ],
      },
    });
  }
  return sheets;
}

export async function parseDataFile(
  fileType: DataFileType,
  bytes: Uint8Array,
): Promise<ParsedWorkbook> {
  try {
    if (fileType === "csv") {
      const sheet = parseCsv(Buffer.from(bytes).toString("utf8"));
      return { sheets: [sheet], totalRows: sheet.rows.length };
    }
    const sheets = await parseXlsx(bytes);
    return {
      sheets,
      totalRows: sheets.reduce((s, x) => s + x.rows.length, 0),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      400,
      "PARSE_FAILED",
      "Не удалось прочитать файл. Проверьте формат.",
    );
  }
}
