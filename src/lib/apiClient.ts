export class ClientError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
      window.location.replace("/login");
    }
    throw new ClientError(response.status, body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "Не удалось выполнить запрос. Попробуйте ещё раз.");
  }
  return body as T;
}
