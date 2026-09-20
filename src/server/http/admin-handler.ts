import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import type { Identity } from "../identity/auth.ts";
import { AppError, json, readJson, requireOrigin, respond } from "./errors.ts";
import { AdminService } from "../admin/service.ts";
import { requirePlatformAdmin } from "../admin/require-admin.ts";
import type { PlatformAdminPermission } from "../admin/permissions.ts";
import type { PlatformAdminRole } from "../admin/permissions.ts";

type AdminRuntime = {
  auth: Identity;
  db: Kysely<Database>;
  secret: string;
  origin: string;
};

function qs(url: string) {
  return new URL(url).searchParams;
}

function pageParams(params: URLSearchParams) {
  return {
    page: Number(params.get("page") || 1) || 1,
    pageSize: Number(params.get("pageSize") || 20) || 20,
  };
}

export function createAdminHandler(runtime: AdminRuntime) {
  const admin = new AdminService(runtime.db);

  async function gate(
    request: Request,
    permission: PlatformAdminPermission,
  ) {
    return requirePlatformAdmin(runtime, request.headers, permission);
  }

  return {
    me: (request: Request) =>
      respond(async () => {
        const actor = await gate(request, "admin.search");
        return json(admin.sessionInfo(actor));
      }),

    dashboard: (request: Request) =>
      respond(async () => {
        await gate(request, "admin.system.read");
        return json(await admin.dashboard());
      }),

    search: (request: Request) =>
      respond(async () => {
        await gate(request, "admin.search");
        return json(await admin.search(qs(request.url).get("q") || ""));
      }),

    users: (request: Request) =>
      respond(async () => {
        await gate(request, "admin.users.read");
        const params = qs(request.url);
        return json(
          await admin.listUsers({
            q: params.get("q") || undefined,
            status: (params.get("status") as "active" | "suspended") || undefined,
            adminOnly: params.get("admin") === "1" || params.get("admin") === "true",
            ...pageParams(params),
          }),
        );
      }),

    user: (request: Request, publicId: string) =>
      respond(async () => {
        if (request.method === "GET") {
          await gate(request, "admin.users.read");
          return json(await admin.getUser(publicId));
        }
        if (request.method === "POST") {
          requireOrigin(request, runtime.origin);
          const body = await readJson(request);
          const action = String(body.action || "");
          if (action === "suspend") {
            const actor = await gate(request, "admin.users.manage");
            await admin.suspendEntity(actor, {
              entityType: "user",
              entityPublicId: publicId,
              reason: String(body.reason || ""),
            });
            return json({ ok: true });
          }
          if (action === "unsuspend") {
            const actor = await gate(request, "admin.users.manage");
            await admin.liftSuspension(actor, {
              entityType: "user",
              entityPublicId: publicId,
              reason: String(body.reason || ""),
            });
            return json({ ok: true });
          }
          if (action === "assign_role") {
            const actor = await gate(request, "admin.admins.manage");
            await admin.assignAdminRole(actor, {
              userPublicId: publicId,
              role: String(body.role || "") as PlatformAdminRole,
            });
            return json({ ok: true });
          }
          if (action === "revoke_role") {
            const actor = await gate(request, "admin.admins.manage");
            await admin.revokeAdminRole(actor, {
              userPublicId: publicId,
              reason: String(body.reason || ""),
            });
            return json({ ok: true });
          }
          throw new AppError(400, "INVALID_ACTION", "Неизвестное действие.");
        }
        throw new AppError(405, "METHOD_NOT_ALLOWED", "Метод не поддерживается.");
      }),

    businesses: (request: Request) =>
      respond(async () => {
        await gate(request, "admin.businesses.read");
        const params = qs(request.url);
        return json(
          await admin.listBusinesses({
            q: params.get("q") || undefined,
            industry: params.get("industry") || undefined,
            status:
              (params.get("status") as "active" | "archived" | "suspended") ||
              undefined,
            telegram:
              (params.get("telegram") as
                | "connected"
                | "error"
                | "disconnected"
                | "any") || undefined,
            vk:
              (params.get("vk") as
                | "connected"
                | "error"
                | "disconnected"
                | "any") || undefined,
            solution: params.get("solution") || undefined,
            ...pageParams(params),
          }),
        );
      }),

    business: (request: Request, publicId: string) =>
      respond(async () => {
        if (request.method === "GET") {
          await gate(request, "admin.businesses.read");
          return json(await admin.getBusiness(publicId));
        }
        if (request.method === "POST") {
          requireOrigin(request, runtime.origin);
          const body = await readJson(request);
          const action = String(body.action || "");
          if (action === "suspend") {
            const actor = await gate(request, "admin.businesses.manage");
            await admin.suspendEntity(actor, {
              entityType: "business",
              entityPublicId: publicId,
              reason: String(body.reason || ""),
            });
            return json({ ok: true });
          }
          if (action === "unsuspend") {
            const actor = await gate(request, "admin.businesses.manage");
            await admin.liftSuspension(actor, {
              entityType: "business",
              entityPublicId: publicId,
              reason: String(body.reason || ""),
            });
            return json({ ok: true });
          }
          if (action === "override_solution") {
            const actor = await gate(request, "admin.subscriptions.manage");
            await admin.overrideSolution(actor, {
              businessPublicId: publicId,
              solutionCode: String(body.solutionCode || ""),
              status: String(body.status || "") as
                | "active"
                | "trial"
                | "expired"
                | "disabled",
              expiresAt:
                body.expiresAt === null
                  ? null
                  : body.expiresAt
                    ? String(body.expiresAt)
                    : undefined,
              reason: String(body.reason || ""),
            });
            return json({ ok: true });
          }
          throw new AppError(400, "INVALID_ACTION", "Неизвестное действие.");
        }
        throw new AppError(405, "METHOD_NOT_ALLOWED", "Метод не поддерживается.");
      }),

    subscriptions: (request: Request) =>
      respond(async () => {
        await gate(request, "admin.subscriptions.read");
        const params = qs(request.url);
        return json(
          await admin.listSubscriptions({
            q: params.get("q") || undefined,
            status:
              (params.get("status") as
                | "active"
                | "trial"
                | "expired"
                | "disabled") || undefined,
            ...pageParams(params),
          }),
        );
      }),

    integrations: (request: Request) =>
      respond(async () => {
        await gate(request, "admin.integrations.read");
        const params = qs(request.url);
        return json(
          await admin.listIntegrations({
            q: params.get("q") || undefined,
            platform: (params.get("platform") as "telegram" | "vk") || undefined,
            status:
              (params.get("status") as
                | "pending"
                | "connected"
                | "error"
                | "disconnected") || undefined,
            ...pageParams(params),
          }),
        );
      }),

    integration: (request: Request, connectionId: string) =>
      respond(async () => {
        if (request.method === "GET") {
          await gate(request, "admin.support.read");
          return json(await admin.integrationDiagnostics(connectionId));
        }
        if (request.method === "POST") {
          requireOrigin(request, runtime.origin);
          const body = await readJson(request);
          if (String(body.action || "") !== "retry_outbox") {
            throw new AppError(400, "INVALID_ACTION", "Неизвестное действие.");
          }
          const actor = await gate(request, "admin.support.manage");
          await admin.retryOutbox(actor, {
            platform: String(body.platform || "") as "telegram" | "vk",
            outboxId: String(body.outboxId || ""),
            reason: String(body.reason || ""),
          });
          return json({ ok: true });
        }
        throw new AppError(405, "METHOD_NOT_ALLOWED", "Метод не поддерживается.");
      }),

    audit: (request: Request) =>
      respond(async () => {
        await gate(request, "admin.audit.read");
        const params = qs(request.url);
        return json(
          await admin.listAudit({
            admin: params.get("admin") || undefined,
            action: params.get("action") || undefined,
            targetType: params.get("targetType") || undefined,
            businessPublicId: params.get("business") || undefined,
            from: params.get("from") || undefined,
            until: params.get("until") || undefined,
            ...pageParams(params),
          }),
        );
      }),

    system: (request: Request) =>
      respond(async () => {
        await gate(request, "admin.system.read");
        const dash = await admin.dashboard();
        return json({
          health: dash.health,
          alerts: dash.alerts,
          connections: dash.connections,
          activity: dash.activity,
        });
      }),
  };
}
