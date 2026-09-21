import { getRuntime } from "../runtime";
import { createApplication } from "./application";
import { AppError, json, readJson, requireOrigin, respond } from "./errors";
import { limit } from "./limits";
import { AnalyticsService } from "../analytics/service";
import { AnalyticsFileService } from "../analytics/files/service";
import { AnalyticsExportService } from "../analytics/export";
import { AnalyticsAiService } from "../analytics/ai/analyst";
import { readLimited } from "../attachments/storage";
import type { PeriodPreset } from "../analytics/periods";
import type { ExportEntity, ExportFormat } from "../analytics/export";

function periodFrom(search: URLSearchParams): {
  preset: PeriodPreset;
  custom?: { from: string; until: string };
} {
  const preset = (search.get("period") || "30d") as PeriodPreset;
  const from = search.get("from") || undefined;
  const until = search.get("until") || undefined;
  return {
    preset,
    custom: from && until ? { from, until } : undefined,
  };
}

export function analyticsHandler(
  request: Request,
  publicId: string,
  resource:
    | "overview"
    | "section"
    | "summary"
    | "files"
    | "export"
    | "ai"
    | "file-rows"
    | "file-download"
    | "file-mapping",
  resourceId?: string,
  section?: string,
) {
  return respond(request, async () => {
    const runtime = getRuntime();
    const user = await createApplication(runtime).requireUser(request.headers);
    const analytics = new AnalyticsService(runtime.db);
    const files = new AnalyticsFileService(runtime.db);
    const exporter = new AnalyticsExportService(runtime.db);
    const ai = new AnalyticsAiService(runtime.db);
    const search = new URL(request.url).searchParams;

    if (request.method !== "GET") {
      requireOrigin(request, runtime.origin);
      await limit(
        runtime.db,
        runtime.secret,
        "analytics:" + publicId + ":" + user.id,
        40,
        60,
      );
    }

    if (resource === "overview" && request.method === "GET") {
      const { preset, custom } = periodFrom(search);
      return json(await analytics.overview(user.id, publicId, preset, custom));
    }

    if (resource === "summary" && request.method === "GET")
      return json(await analytics.dashboardSummary(user.id, publicId));

    if (resource === "section" && request.method === "GET" && section) {
      const { preset, custom } = periodFrom(search);
      return json(
        await analytics.section(user.id, publicId, section, preset, custom),
      );
    }

    if (resource === "files") {
      if (request.method === "GET" && !resourceId)
        return json(await files.list(user.id, publicId));
      if (request.method === "GET" && resourceId)
        return json(await files.get(user.id, publicId, resourceId));
      if (request.method === "DELETE" && resourceId)
        return json(await files.remove(user.id, publicId, resourceId));
      if (request.method === "POST" && !resourceId) {
        await limit(
          runtime.db,
          runtime.secret,
          "analytics-upload:" + user.id,
          10,
          60,
        );
        const filename =
          decodeURIComponent(
            request.headers.get("x-file-name") || "table.csv",
          ).slice(0, 255) || "table.csv";
        const mime = request.headers.get("content-type") || "application/octet-stream";
        const reader = request.body?.getReader();
        if (!reader)
          throw new AppError(400, "EMPTY_FILE", "Файл пустой.");
        const bytes = await readLimited(reader);
        return json(
          await files.upload(user.id, publicId, filename, mime, bytes),
          201,
        );
      }
    }

    if (resource === "file-rows" && resourceId && request.method === "GET") {
      return json(
        await files.rows(user.id, publicId, resourceId, {
          sheetId: search.get("sheet") || undefined,
          page: Number(search.get("page") ?? 0),
          search: search.get("q") || undefined,
          sortCol: search.get("sortCol")
            ? Number(search.get("sortCol"))
            : undefined,
          sortDir: (search.get("sortDir") as "asc" | "desc") || undefined,
        }),
      );
    }

    if (
      resource === "file-download" &&
      resourceId &&
      request.method === "GET"
    ) {
      const file = await files.download(user.id, publicId, resourceId);
      return new Response(Buffer.from(file.bytes), {
        status: 200,
        headers: {
          "Content-Type": file.mime,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (
      resource === "file-mapping" &&
      resourceId &&
      request.method === "PATCH"
    ) {
      const body = await readJson(request);
      return json(
        await files.updateMapping(
          user.id,
          publicId,
          resourceId,
          (body.mapping as Record<string, string>) ?? {},
        ),
      );
    }

    if (resource === "export" && request.method === "POST") {
      const body = await readJson(request);
      const entity = String(body.entity || "") as ExportEntity;
      const format = (String(body.format || "csv") as ExportFormat) || "csv";
      const preset = (String(body.period || "30d") as PeriodPreset) || "30d";
      const result = await exporter.export(
        user.id,
        publicId,
        entity,
        format,
        preset,
        body.from && body.until
          ? { from: String(body.from), until: String(body.until) }
          : undefined,
      );
      return new Response(Buffer.from(result.bytes), {
        status: 200,
        headers: {
          "Content-Type": result.mime,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (resource === "ai" && request.method === "POST") {
      await limit(
        runtime.db,
        runtime.secret,
        "analytics-ai:" + user.id,
        8,
        60,
      );
      const body = await readJson(request, 8000);
      return json(
        await ai.ask(user.id, publicId, {
          question: String(body.question ?? ""),
          source: body.source === "file" ? "file" : "sreda",
          fileId: body.fileId ? String(body.fileId) : undefined,
          period: body.period as PeriodPreset | undefined,
          full: Boolean(body.full),
        }),
      );
    }

    throw new AppError(404, "NOT_FOUND", "Страница не найдена.");
  });
}
