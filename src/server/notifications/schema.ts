import type { Generated } from "kysely";
export interface NotificationTables {
  notification_binding: {
    business_id: string;
    user_id: string;
    platform: Generated<"telegram" | "vk" | "whatsapp" | "instagram">;
    connection_id: string;
    chat_id: string | null;
    code_hash: string | null;
    expires_at: Date | null;
    created_at: Generated<Date>;
  };
  notification_preference: {
    business_id: string;
    user_id: string;
    type: string;
    enabled: boolean;
  };
  provider_identity: {
    id: string;
    user_id: string;
    platform: "telegram" | "vk";
    external_user_id: string;
    display_name: string | null;
    username: string | null;
    created_at: Generated<Date>;
    revoked_at: Date | null;
  };
  business_channel_admin: {
    business_id: string;
    user_id: string;
    platform: "telegram" | "vk";
    provider_identity_id: string;
    connection_id: string;
    status: "active" | "revoked";
    bound_at: Generated<Date>;
    revoked_at: Date | null;
    last_active_at: Date | null;
  };
  channel_admin_challenge: {
    id: string;
    purpose: "bind_from_web" | "bind_from_channel";
    token_hash: string;
    user_id: string;
    business_id: string;
    platform: "telegram" | "vk";
    connection_id: string | null;
    expires_at: Date;
    consumed_at: Date | null;
    created_at: Generated<Date>;
  };
  channel_admin_session: {
    connection_id: string;
    external_user_id: string;
    platform: "telegram" | "vk";
    user_id: string;
    business_id: string;
    mode: string;
    step: string;
    draft: Generated<unknown>;
    updated_at: Generated<Date>;
  };
}
