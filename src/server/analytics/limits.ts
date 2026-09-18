/** Configurable limits for analytics file ingest. Override via env in production. */
export const ANALYTICS_LIMITS = {
  maxFileBytes: Number(process.env.ANALYTICS_MAX_FILE_BYTES ?? 10 * 1024 * 1024),
  maxSheets: Number(process.env.ANALYTICS_MAX_SHEETS ?? 20),
  maxRows: Number(process.env.ANALYTICS_MAX_ROWS ?? 25_000),
  maxColumns: Number(process.env.ANALYTICS_MAX_COLUMNS ?? 64),
  maxCellChars: Number(process.env.ANALYTICS_MAX_CELL_CHARS ?? 2_000),
  sampleRows: Number(process.env.ANALYTICS_SAMPLE_ROWS ?? 40),
  viewerPageSize: Number(process.env.ANALYTICS_VIEWER_PAGE_SIZE ?? 50),
} as const;

export function limitLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
}
