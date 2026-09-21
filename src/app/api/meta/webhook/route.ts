import { getRuntime } from "@/server/runtime";
import { MetaChannelService } from "@/server/meta/service";
import { AppError, respond } from "@/server/http/errors";
import { readMetaConfig } from "@/server/meta/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return respond(request, async () => {
    const url = new URL(request.url);
    const r = getRuntime();
    const enabled =
      process.env.META_WEBHOOKS_ENABLED === "true" ||
      process.env.WHATSAPP_WEBHOOKS_ENABLED === "true" ||
      process.env.INSTAGRAM_WEBHOOKS_ENABLED === "true";
    const service = new MetaChannelService(
      r.db,
      r.secret,
      enabled,
      r.communications,
      fetch,
      readMetaConfig(),
    );
    const challenge = service.handleWebhookVerify(
      url.searchParams.get("hub.mode"),
      url.searchParams.get("hub.verify_token"),
      url.searchParams.get("hub.challenge"),
    );
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  });
}

export async function POST(request: Request) {
  return respond(request, async () => {
    const r = getRuntime();
    const enabled =
      process.env.META_WEBHOOKS_ENABLED === "true" ||
      process.env.WHATSAPP_WEBHOOKS_ENABLED === "true" ||
      process.env.INSTAGRAM_WEBHOOKS_ENABLED === "true";
    const rawBody = await request.text();
    if (rawBody.length > 1024 * 1024)
      throw new AppError(413, "PAYLOAD_TOO_LARGE", "Слишком большой запрос.");
    const service = new MetaChannelService(
      r.db,
      r.secret,
      enabled,
      r.communications,
      fetch,
      readMetaConfig(),
    );
    await service.receiveWebhook(
      rawBody,
      request.headers.get("x-hub-signature-256"),
    );
    return new Response("EVENT_RECEIVED", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  });
}
