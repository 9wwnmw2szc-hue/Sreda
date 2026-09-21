import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = { requestId: string };

const storage = new AsyncLocalStorage<RequestContext>();

/** Accept client-supplied correlation id when well-formed; otherwise mint a UUID. */
export function resolveRequestId(headerValue: string | null | undefined): string {
  const value = headerValue?.trim();
  if (value && /^[A-Za-z0-9._:-]{8,128}$/.test(value)) return value;
  return crypto.randomUUID();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

export function withRequestIdHeader(
  response: Response,
  requestId: string,
): Response {
  if (response.headers.get("x-request-id") === requestId) return response;
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
