import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import {
  AppError,
  json,
  readJson,
  requireOrigin,
  respond,
} from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import {
  completeInstagramLogin,
  completeWhatsAppEmbeddedSignup,
  selectInstagramAccount,
} from "@/server/meta/oauth";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(request, async () => {
    const r = getRuntime();
    requireOrigin(request, r.origin);
    const user = await createApplication(r).requireUser(request.headers);
    const publicId = (await params).id;
    await limit(r.db, r.secret, "meta-callback:" + user.id, 10, 60);
    const body = await readJson(request, 65536);
    const action = body.action;
    if (action === "whatsapp_embedded_signup") {
      if (
        typeof body.code !== "string" ||
        typeof body.redirectUri !== "string" ||
        typeof body.state !== "string" ||
        typeof body.wabaId !== "string" ||
        typeof body.phoneNumberId !== "string"
      )
        throw new AppError(
          400,
          "INVALID_CALLBACK",
          "Не хватает данных Embedded Signup.",
        );
      return json(
        await completeWhatsAppEmbeddedSignup({
          db: r.db,
          secret: r.secret,
          userId: user.id,
          publicId,
          code: body.code,
          redirectUri: body.redirectUri,
          state: body.state,
          wabaId: body.wabaId,
          phoneNumberId: body.phoneNumberId,
        }),
      );
    }
    if (action === "instagram_login") {
      if (
        typeof body.code !== "string" ||
        typeof body.redirectUri !== "string" ||
        typeof body.state !== "string"
      )
        throw new AppError(
          400,
          "INVALID_CALLBACK",
          "Не хватает данных авторизации Instagram.",
        );
      return json(
        await completeInstagramLogin({
          db: r.db,
          userId: user.id,
          publicId,
          code: body.code,
          redirectUri: body.redirectUri,
          state: body.state,
        }),
      );
    }
    if (action === "instagram_select") {
      if (
        typeof body.pageId !== "string" ||
        typeof body.igUserId !== "string" ||
        typeof body.accessToken !== "string"
      )
        throw new AppError(
          400,
          "INVALID_CALLBACK",
          "Выберите аккаунт Instagram.",
        );
      return json(
        await selectInstagramAccount({
          db: r.db,
          secret: r.secret,
          userId: user.id,
          publicId,
          pageId: body.pageId,
          igUserId: body.igUserId,
          accessToken: body.accessToken,
          igUsername:
            typeof body.igUsername === "string" ? body.igUsername : null,
          pageName: typeof body.pageName === "string" ? body.pageName : null,
        }),
      );
    }
    throw new AppError(400, "INVALID_ACTION", "Неизвестное действие Meta.");
  });
}
