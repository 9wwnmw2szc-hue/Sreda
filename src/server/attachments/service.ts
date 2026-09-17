import { vkCall } from "../vk/api.ts";
import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import type { AttachmentType } from "./schema.ts";
import { requireBusiness } from "../access/permissions.ts";
import { AppError } from "../http/errors.ts";
import {
  attachmentStorage,
  MAX_ATTACHMENT,
  readLimited,
  type AttachmentStorage,
} from "./storage.ts";
import { decryptSecret } from "../connections/crypto.ts";
import { telegramCall } from "../telegram/api.ts";
export type InboundAttachment = {
  type: AttachmentType;
  filename: string;
  mime: string;
  size?: number;
  external: Record<string, unknown>;
};
export function validateFile(
  bytes: Uint8Array,
  mime: string,
  type: AttachmentType,
) {
  const b = Buffer.from(bytes);
  if (!b.length || b.length > MAX_ATTACHMENT)
    throw new AppError(
      413,
      "FILE_TOO_LARGE",
      "Размер файла должен быть от 1 байта до 50 МБ.",
    );
  const signatures: Record<string, boolean> = {
    "image/jpeg": b[0] === 255 && b[1] === 216 && b[2] === 255,
    "image/png": b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/webp":
      b.subarray(0, 4).toString() === "RIFF" &&
      b.subarray(8, 12).toString() === "WEBP",
    "video/mp4": b.subarray(4, 8).toString() === "ftyp",
    "video/webm": b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])),
    "audio/ogg": b.subarray(0, 4).toString() === "OggS",
    "audio/mpeg":
      b.subarray(0, 3).toString() === "ID3" ||
      (b[0] === 255 && (b[1]! & 224) === 224),
    "application/pdf": b.subarray(0, 5).toString() === "%PDF-",
    "text/plain": !b.includes(0) && !b.toString("utf8").includes("\uFFFD"),
  };
  if (
    !signatures[mime] ||
    (type === "image" && !mime.startsWith("image/")) ||
    (type === "video" && !mime.startsWith("video/")) ||
    (type === "voice" && !mime.startsWith("audio/"))
  )
    throw new AppError(
      400,
      "INVALID_ATTACHMENT",
      "Тип или содержимое файла не поддерживается.",
    );
}
export class AttachmentService {
  constructor(
    private db: Kysely<Database>,
    private secret: string,
    private storage?: AttachmentStorage,
    private transport: typeof fetch = fetch,
  ) {}
  async upload(
    user: string,
    publicId: string,
    filename: string,
    mime: string,
    type: AttachmentType,
    bytes: Uint8Array,
  ) {
    const b = await requireBusiness(this.db, user, publicId, "messages.write");
    validateFile(bytes, mime, type);
    const id = randomUUID(),
      key = b.id + "/" + id,
      storage = this.storage ?? attachmentStorage();
    await storage.put(key, bytes, mime);
    try {
      const row = await this.db.transaction().execute(async (tx) => {
        await tx
          .selectFrom("business")
          .select("id")
          .where("id", "=", b.id)
          .forUpdate()
          .execute();
        await requireBusiness(tx, user, publicId, "messages.write");
        return tx
          .insertInto("attachment")
          .values({
            id,
            business_id: b.id,
            type,
            provider: "storage",
            storage_key: key,
            connection_id: null,
            external: "{}",
            filename:
              filename
                .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
                .slice(0, 150) || "file",
            mime_type: mime,
            size_bytes: String(bytes.length),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      });
      return this.public(row);
    } catch (e) {
      await storage.remove(key).catch(() => {});
      throw e;
    }
  }
  public(row: {
    id: string;
    type: AttachmentType;
    filename: string;
    mime_type: string;
    size_bytes: string | null;
  }) {
    return {
      id: row.id,
      type: row.type,
      filename: row.filename,
      mime: row.mime_type,
      size: row.size_bytes ? Number(row.size_bytes) : null,
    };
  }
  async file(user: string, publicId: string, id: string) {
    const b = await requireBusiness(this.db, user, publicId, "clients.read");
    return this.load(b.id, id);
  }
  async load(businessId: string, id: string) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        id,
      )
    )
      throw new AppError(
        400,
        "INVALID_ATTACHMENT",
        "Проверьте идентификатор файла.",
      );
    const row = await this.db
      .selectFrom("attachment")
      .selectAll()
      .where("business_id", "=", businessId)
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row)
      throw new AppError(404, "ATTACHMENT_NOT_FOUND", "Файл не найден.");
    let bytes: Uint8Array;
    if (row.provider === "storage") {
      if (!row.storage_key) throw Error("Missing storage key");
      bytes = await (this.storage ?? attachmentStorage()).get(row.storage_key);
    } else {
      let url = "";
      const external = row.external as Record<string, unknown>;
      if (row.provider === "telegram") {
        const c = await this.db
          .selectFrom("connection_secret as s")
          .innerJoin("business_connection as c", "c.id", "s.connection_id")
          .select("s.encrypted_token")
          .where("c.business_id", "=", businessId)
          .where("c.id", "=", row.connection_id)
          .executeTakeFirst();
        if (!c)
          throw new AppError(
            409,
            "CONNECTION_REQUIRED",
            "Подключение файла недоступно.",
          );
        const token = decryptSecret(c.encrypted_token, this.secret);
        const file = await telegramCall(
          token,
          "getFile",
          { file_id: external.file_id },
          this.transport,
        );
        if (
          !file?.file_path ||
          !/^[a-zA-Z0-9_./-]+$/.test(file.file_path) ||
          file.file_path.includes("..")
        )
          throw new AppError(
            503,
            "ATTACHMENT_UNAVAILABLE",
            "Telegram не предоставил файл.",
          );
        url = `https://api.telegram.org/file/bot${encodeURIComponent(token)}/${file.file_path}`;
      } else {
        url = String(external.url ?? "");
        if (external.video) {
          const secret = await this.db
            .selectFrom("connection_secret")
            .select("encrypted_publish_token")
            .where("connection_id", "=", row.connection_id)
            .executeTakeFirst();
          if (!secret?.encrypted_publish_token)
            throw new AppError(
              409,
              "VK_VIDEO_TOKEN_REQUIRED",
              "Для загрузки видео VK подключите пользовательский ключ публикаций.",
            );
          const result = (await vkCall(
            decryptSecret(secret.encrypted_publish_token, this.secret),
            "video.get",
            { videos: external.video },
            this.transport,
          )) as { items?: { files?: Record<string, string> }[] };
          const files = result.items?.[0]?.files ?? {};
          url = files.mp4_720 ?? files.mp4_480 ?? files.mp4_360 ?? "";
        }
        const parsed = new URL(url);
        if (
          parsed.protocol !== "https:" ||
          !/(^|\.)(userapi\.com|vkuseraudio\.net|vkuseraudio\.com|vkuserlive\.net|vkuser\.net|vk\.com)$/.test(
            parsed.hostname,
          )
        )
          throw new AppError(
            503,
            "ATTACHMENT_UNAVAILABLE",
            "Файл VK недоступен.",
          );
      }
      const response = await this.transport(url, {
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok || !response.body)
        throw new AppError(
          503,
          "ATTACHMENT_UNAVAILABLE",
          "Не удалось скачать файл.",
        );
      bytes = await readLimited(response.body.getReader());
    }
    if (bytes.length > MAX_ATTACHMENT)
      throw new AppError(413, "FILE_TOO_LARGE", "Файл превышает 50 МБ.");
    return { ...this.public(row), bytes };
  }
}
export async function recordAttachments(
  tx: Transaction<Database>,
  businessId: string,
  connectionId: string,
  platform: "telegram" | "vk",
  messageId: string,
  files: InboundAttachment[],
) {
  for (const file of files.slice(0, 10)) {
    if (file.size && file.size > MAX_ATTACHMENT) continue;
    const id = randomUUID();
    await tx
      .insertInto("attachment")
      .values({
        id,
        business_id: businessId,
        type: file.type,
        provider: platform,
        storage_key: null,
        connection_id: connectionId,
        external: JSON.stringify(file.external),
        filename: file.filename.slice(0, 150),
        mime_type: file.mime,
        size_bytes: file.size ? String(file.size) : null,
      })
      .execute();
    await tx
      .insertInto("communication_attachment")
      .values({
        business_id: businessId,
        message_id: messageId,
        attachment_id: id,
      })
      .execute();
  }
}
