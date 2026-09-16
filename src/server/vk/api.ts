import { AppError } from "../http/errors.ts";

export class VKError extends AppError {
  constructor(
    public readonly retryAfter = 0,
    public readonly permanent = false,
    public readonly chatUnavailable = false,
    public readonly uncertain = false,
  ) {
    super(503, "VK_UNAVAILABLE", "VK не подтвердил действие. Попробуйте позже.");
  }
}

type VKResponse = { response?: unknown; error?: { error_code?: number; error_msg?: string; request_params?: unknown } };

export async function vkCall(
  token: string,
  method: "messages.send" | "wall.post" | "groups.getTokenPermissions" | "groups.getById" | "groups.getCallbackConfirmationCode" | "groups.getCallbackServers" | "groups.addCallbackServer" | "groups.editCallbackServer" | "groups.setCallbackSettings",
  body: Record<string,unknown>,
  transport: typeof fetch = fetch,
) {
  try {
    const params=new URLSearchParams({access_token:token,v:'5.199'});for(const [key,value] of Object.entries(body))if(value!==undefined)params.set(key,typeof value==='object'?JSON.stringify(value):String(value));
    const response = await transport(`https://api.vk.com/method/${method}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params, redirect: "error", signal: AbortSignal.timeout(5000), cache: "no-store" });
    const data = await response.json().catch(() => null) as VKResponse | null;
    if (!response.ok || data?.error) {
      const code = Number(data?.error?.error_code) || response.status;
      const permanent = [5, 15, 100, 111, 113].includes(code);
      const chatUnavailable = method === "messages.send" && [901, 902, 935].includes(code);
      throw new VKError(0, permanent, chatUnavailable);
    }
    if (!data || !("response" in data)) throw new VKError(0,false,false,true);
    return data.response;
  } catch (error) {
    if (error instanceof VKError) throw error;
    throw new VKError(0,false,false,true);
  }
}
