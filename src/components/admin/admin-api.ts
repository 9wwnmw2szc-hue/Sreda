export class AdminApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

function redirectToLogin() {
  if (typeof window !== "undefined") {
    window.location.replace("/admin/login");
  }
}

async function parseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorFromBody(status: number, body: unknown): AdminApiError {
  const err =
    body && typeof body === "object" && "error" in body
      ? (body as { error?: { code?: string; message?: string } }).error
      : undefined;
  return new AdminApiError(
    status,
    err?.code ?? "REQUEST_FAILED",
    err?.message ?? "Не удалось выполнить запрос.",
  );
}

export async function adminGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const body = await parseBody(response);
  if (!response.ok) {
    if (response.status === 401) redirectToLogin();
    throw errorFromBody(response.status, body);
  }
  return body as T;
}

export async function adminPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const parsed = await parseBody(response);
  if (!response.ok) {
    if (response.status === 401) redirectToLogin();
    throw errorFromBody(response.status, parsed);
  }
  return parsed as T;
}

export type AdminMe = {
  id: string;
  name: string;
  username: string;
  role: string;
  permissions: readonly string[];
};

export function hasPermission(
  me: AdminMe | null | undefined,
  permission: string,
): boolean {
  return Boolean(me?.permissions?.includes(permission));
}
