import type { Identity } from "../identity/auth.ts";
import type { WorkspaceService } from "../workspaces/service.ts";
import { AppError, json, readJson, requireOrigin, respond } from "./errors.ts";

export function createApplication(options: { auth: Identity; workspaces: WorkspaceService; origin: string }) {
  async function requireUser(headers: Headers) {
    const session = await options.auth.api.getSession({ headers });
    if (!session || !session.user.emailVerified) throw new AppError(401, "UNAUTHENTICATED", "Войдите в аккаунт.");
    return session.user;
  }
  return {
    requireUser,
    me: (request: Request) => respond(async () => {
      const user = await requireUser(request.headers);
      return json({ id: user.id, name: user.name, email: user.email });
    }),
    businesses: (request: Request) => respond(async () => {
      if (request.method === "POST") requireOrigin(request, options.origin);
      const user = await requireUser(request.headers);
      if (request.method === "GET") return json(await options.workspaces.list(user.id));
      const business = await options.workspaces.create(user.id,
        await readJson(request), request.headers.get("idempotency-key"));
      return json(business, 201);
    }),
    business: (request: Request, id: string) => respond(async () => {
      const user = await requireUser(request.headers);
      return json(await options.workspaces.require(user.id, id));
    }),
  };
}
