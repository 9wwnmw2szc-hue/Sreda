import type { Generated } from "kysely";
export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial"
  | "failed"
  | "cancelled";
export interface PostTables {
  post_target: {
    id: string;
    business_id: string;
    connection_id: string;
    platform: "telegram" | "vk";
    external_id: string;
    title: string;
    active: Generated<boolean>;
    created_at: Generated<Date>;
  };
  post: {
    deleted_at: Generated<Date | null>;
    id: string;
    business_id: string;
    text: string;
    buttons: Generated<unknown>;
    status: PostStatus;
    scheduled_at: Date | null;
    revision: Generated<number>;
    created_by: string;
    request_key: string;
    request_hash: string;
    template_id: Generated<string | null>;
    occurrence_at: Generated<Date | null>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  post_delivery: {
    id: string;
    business_id: string;
    post_id: string;
    target_id: string;
    status: Generated<
      | "pending"
      | "publishing"
      | "published"
      | "failed"
      | "uncertain"
      | "cancelled"
    >;
    external_message_id: string | null;
    last_error: string | null;
  };
  post_schedule: {
    post_id: string;
    business_id: string;
    rule: unknown;
    active: Generated<boolean>;
    next_at: Date | null;
    revision: Generated<number>;
  };
}
