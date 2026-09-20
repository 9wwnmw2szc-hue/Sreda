import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { json, requireOrigin, respond, AppError, readJson } from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import { createOAuthState, metaStartPayload } from "@/server/meta/oauth";
import { MetaChannelService } from "@/server/meta/service";
import { isMetaPlatform } from "@/server/channels/types";
import { readMetaConfig } from "@/server/meta/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return respond(async () => {
    const r = getRuntime();
    await createApplication(r).requireUser(request.headers);
    const platform = new URL(request.url).searchParams.get("platform");
    if (!isMetaPlatform(platform))
      throw new AppError(
        400,
        "INVALID_PLATFORM",
        "Укажите platform=whatsapp или platform=instagram.",
      );
    return json(metaStartPayload(platform));
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const r = getRuntime();
    requireOrigin(request, r.origin);
    const user = await createApplication(r).requireUser(request.headers);
    const publicId = (await params).id;
    await limit(r.db, r.secret, "meta-start:" + user.id, 10, 60);
    const body = await readJson(request);
    const platform = body.platform;
    if (!isMetaPlatform(platform))
      throw new AppError(
        400,
        "INVALID_PLATFORM",
        "Укажите platform=whatsapp или platform=instagram.",
      );
    if (body.action === "oauth") {
      const business = await r.db
        .selectFrom("business_member as member")
        .innerJoin("business", "business.id", "member.business_id")
        .select("business.id")
        .where("business.public_id", "=", publicId)
        .where("business.archived_at", "is", null)
        .where("member.user_id", "=", user.id)
        .where("member.status", "=", "active")
        .executeTakeFirst();
      if (!business)
        throw new AppError(404, "BUSINESS_NOT_FOUND", "Бизнес не найден.");
      const oauth = await createOAuthState(
        r.db,
        business.id,
        user.id,
        platform,
      );
      return json({
        ...metaStartPayload(platform),
        state: oauth.state,
      });
    }
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
    if (platform === "whatsapp")
      return json(await service.startWhatsApp(user.id, publicId));
    return json(await service.startInstagram(user.id, publicId));
  });
}
