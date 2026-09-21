import { getRequestId } from "./request-context.ts";

const SECRET_KEYS =
  /pass(word)?|secret|token|authorization|cookie|api[_-]?key|private[_-]?key|credential/i;

type LogLevel = "info" | "warn" | "error";

/** Structured JSON logs only — never pass bodies, cookies, or credential fields. */
export function log(
  level: LogLevel,
  code: string,
  fields: Record<string, unknown> = {},
): void {
  const safe: Record<string, unknown> = {
    level,
    code,
    request_id: getRequestId() ?? null,
    ts: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEYS.test(key)) continue;
    if (value === undefined) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      safe[key] = value;
      continue;
    }
    // Avoid dumping nested objects that may hold secrets.
    safe[key] = String(value);
  }
  const line = JSON.stringify(safe);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
