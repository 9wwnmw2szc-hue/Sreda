import { getRuntime } from "@/server/runtime";
import {
  AppError,
  json,
  readJson,
  requireOrigin,
  respond,
} from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import {
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from "@/server/identity/sessions";

export async function GET(request: Request) {
  return respond(request, async () => {
    const r = getRuntime();
    const session = await r.auth.api.getSession({ headers: request.headers });
    if (!session?.user)
      throw new AppError(401, "UNAUTHENTICATED", "Войдите в аккаунт.");
    return json({
      sessions: await listSessions(r.db, session.user.id, session.session.id),
    });
  });
}

export async function POST(request: Request) {
  return respond(request, async () => {
    const r = getRuntime();
    requireOrigin(request, r.origin);
    const session = await r.auth.api.getSession({ headers: request.headers });
    if (!session?.user)
      throw new AppError(401, "UNAUTHENTICATED", "Войдите в аккаунт.");
    await limit(r.db, r.secret, "sessions:" + session.user.id, 20, 600);
    const body = await readJson(request);
    if (body.action === "revoke_others")
      return json(
        await revokeOtherSessions(r.db, session.user.id, session.session.id),
      );
    if (body.action === "revoke" && typeof body.sessionId === "string")
      return json(
        await revokeSession(
          r.db,
          session.user.id,
          session.session.id,
          body.sessionId,
        ),
      );
    throw new AppError(400, "INVALID_ACTION", "Неизвестное действие.");
  });
}
