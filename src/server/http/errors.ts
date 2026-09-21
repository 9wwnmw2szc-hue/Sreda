import { log } from "../observability/log.ts";
import {
  getRequestId,
  resolveRequestId,
  runWithRequestContext,
  withRequestIdHeader,
} from "../observability/request-context.ts";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    Vary: "Cookie",
  };
  const requestId = getRequestId();
  if (requestId) headers["x-request-id"] = requestId;
  return Response.json(data, { status, headers });
}

export async function respond(
  action: () => Promise<Response>,
): Promise<Response>;
export async function respond(
  request: Request,
  action: () => Promise<Response>,
): Promise<Response>;
export async function respond(
  requestOrAction: Request | (() => Promise<Response>),
  maybeAction?: () => Promise<Response>,
): Promise<Response> {
  const request =
    typeof requestOrAction === "function" ? undefined : requestOrAction;
  const action =
    typeof requestOrAction === "function" ? requestOrAction : maybeAction!;
  const parent = getRequestId();
  const requestId =
    parent ??
    resolveRequestId(request?.headers.get("x-request-id") ?? null);

  const execute = async (): Promise<Response> => {
    try {
      const response = await action();
      return withRequestIdHeader(response, requestId);
    } catch (error) {
      if (error instanceof AppError) {
        // requestId kept for API contract (CORE.md); request_id mirrored for ops.
        return withRequestIdHeader(
          json(
            {
              error: {
                code: error.code,
                message: error.message,
                requestId,
                request_id: requestId,
              },
            },
            error.status,
          ),
          requestId,
        );
      }
      // Never log provider errors, request bodies, credentials or customer data.
      log("error", "INTERNAL_ERROR");
      return withRequestIdHeader(
        json(
          {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Сервис временно недоступен. Попробуйте позже.",
              requestId,
              request_id: requestId,
            },
          },
          503,
        ),
        requestId,
      );
    }
  };

  if (parent) return execute();
  return runWithRequestContext({ requestId }, execute);
}

export function requireOrigin(request: Request, origin: string) {
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new AppError(
      403,
      "INVALID_ORIGIN",
      "Обновите страницу и попробуйте ещё раз.",
    );
  }
}

export async function readJson(
  request: Request,
  maxBytes = 4096,
): Promise<Record<string, unknown>> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
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
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new AppError(400, "INVALID_BODY", "Проверьте заполненные поля.");
  }
}
