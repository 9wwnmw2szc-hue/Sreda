import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../http/errors.ts";
import {
  META_GRAPH_BASE,
  readMetaConfig,
  type MetaConfig,
} from "./config.ts";

export class MetaApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public metaCode?: number,
  ) {
    super(message);
  }
}

export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function metaGraph<T = unknown>(
  path: string,
  options: {
    method?: string;
    accessToken: string;
    body?: unknown;
    search?: Record<string, string | undefined>;
    transport?: typeof fetch;
    config?: MetaConfig;
  },
): Promise<T> {
  const transport = options.transport ?? fetch;
  const base = options.config
    ? `https://graph.facebook.com/${options.config.graphApiVersion}`
    : META_GRAPH_BASE;
  const url = new URL(
    path.startsWith("http") ? path : `${base}/${path.replace(/^\//, "")}`,
  );
  url.searchParams.set("access_token", options.accessToken);
  for (const [key, value] of Object.entries(options.search ?? {})) {
    if (value != null && value !== "") url.searchParams.set(key, value);
  }
  const response = await transport(url, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: options.body
      ? { "Content-Type": "application/json" }
      : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    redirect: "error",
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; code?: number; error_subcode?: number };
  } | null;
  if (!response.ok || payload?.error) {
    const message =
      payload?.error?.message ||
      "Meta Graph API временно недоступен. Попробуйте позже.";
    throw new MetaApiError(
      response.status || 502,
      "META_API_ERROR",
      message,
      payload?.error?.code,
    );
  }
  return payload as T;
}

export async function exchangeOAuthCode(code: string, redirectUri: string) {
  const config = readMetaConfig();
  if (!config.appId || !config.appSecret)
    throw new AppError(
      503,
      "META_NOT_CONFIGURED",
      "Подключение Meta ещё не настроено на сервере.",
    );
  const url = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("code", code);
  url.searchParams.set("redirect_uri", redirectUri);
  const response = await fetch(url, { cache: "no-store", redirect: "error" });
  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    error?: { message?: string };
  } | null;
  if (!response.ok || !payload?.access_token) {
    throw new AppError(
      400,
      "META_OAUTH_FAILED",
      payload?.error?.message ||
        "Не удалось завершить авторизацию Meta. Повторите подключение.",
    );
  }
  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in ?? null,
  };
}

/** WhatsApp Cloud API: 24-hour customer care window after last inbound. */
export const WHATSAPP_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function whatsappSessionOpen(lastInboundAt: Date | null | undefined) {
  if (!lastInboundAt) return false;
  return Date.now() - lastInboundAt.getTime() < WHATSAPP_SESSION_WINDOW_MS;
}
