import type { Generated } from "kysely";
export type AttachmentType = "image" | "video" | "document" | "voice";
export interface AttachmentTables {
  attachment: {
    id: string;
    business_id: string;
    type: AttachmentType;
    provider: "storage" | "telegram" | "vk";
    storage_key: string | null;
    connection_id: string | null;
    external: unknown;
    filename: string;
    mime_type: string;
    size_bytes: string | null;
    created_at: Generated<Date>;
  };
  communication_attachment: {
    business_id: string;
    message_id: string;
    attachment_id: string;
  };
  post_attachment: {
    business_id: string;
    post_id: string;
    attachment_id: string;
    position: number;
  };
}
