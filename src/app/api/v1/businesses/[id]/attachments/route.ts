import { requireBusiness } from "@/server/access/permissions";
import { getRuntime } from "@/server/runtime";
import { createApplication } from "@/server/http/application";
import { respond, requireOrigin, json, AppError } from "@/server/http/errors";
import { limit } from "@/server/http/limits";
import { AttachmentService } from "@/server/attachments/service";
import { readLimited } from "@/server/attachments/storage";
import type { AttachmentType } from "@/server/attachments/schema";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(request, async () => {
    const r = getRuntime();
    requireOrigin(request, r.origin);
    const user = await createApplication(r).requireUser(request.headers);
    await limit(r.db, r.secret, "upload:" + user.id, 20, 60);
    const publicId = (await params).id;
    await requireBusiness(r.db, user.id, publicId, "messages.write");
    const type = request.headers.get("x-file-type");
    if (
      !type ||
      !["image", "video", "document", "voice"].includes(type) ||
      !request.body
    )
      throw new AppError(400, "INVALID_ATTACHMENT", "Выберите файл.");
    let filename = "file";
    try {
      filename = decodeURIComponent(
        request.headers.get("x-file-name") ?? "file",
      );
    } catch {
      throw new AppError(400, "INVALID_FILENAME", "Проверьте имя файла.");
    }
    return json(
      await new AttachmentService(r.db, r.secret).upload(
        user.id,
        publicId,
        filename,
        request.headers.get("content-type") ?? "",
        type as AttachmentType,
        await readLimited(request.body.getReader()),
      ),
      201,
    );
  });
}
