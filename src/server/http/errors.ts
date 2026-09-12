export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "Vary": "Cookie" } });
}

export async function respond(action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    const requestId = crypto.randomUUID();
    if (error instanceof AppError) {
      return json({ error: { code: error.code, message: error.message, requestId } }, error.status);
    }
    // Never log provider errors, request bodies, credentials or customer data.
    console.error(JSON.stringify({ requestId, code: "INTERNAL_ERROR" }));
    return json({ error: { code: "SERVICE_UNAVAILABLE", message: "Сервис временно недоступен. Попробуйте позже.", requestId } }, 503);
  }
}

export function requireOrigin(request: Request, origin: string) {
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError(403, "INVALID_ORIGIN", "Обновите страницу и попробуйте ещё раз.");
  }
}

export async function readJson(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AppError(415, "JSON_REQUIRED", "Ожидается JSON.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "INVALID_BODY", "Заполните поля формы.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AppError(413, "BODY_TOO_LARGE", "Слишком много данных.");
    }
    chunks.push(part.value);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new AppError(400, "INVALID_BODY", "Проверьте заполненные поля.");
  }
}
