import type { Generated } from "kysely";

export type Role = "owner" | "admin" | "operator";
export type LeadStatus = "new" | "processing" | "closed";
export interface Database {
  worker_heartbeat: { name: string; seen_at: Date };
  lead_setup: { business_id: string; draft: string; revision: number; updated_at: Date };
  telegram_runtime: { connection_id: string; generation: string; status: "pending" | "ready" | "error"; updated_at: Generated<Date> };
  telegram_dialog: { connection_id: string; chat_id: string; fields: string; answers: string; position: number; last_update_id: string; updated_at: Generated<Date> };
  telegram_update: { connection_id: string; update_id: string; created_at: Generated<Date> };
  telegram_outbox: { id: Generated<string>; connection_id: string; chat_id: string; message: string; attempts: Generated<number>; available_at: Generated<Date>; delivered_at: Date | null; last_error: string | null; created_at: Generated<Date> };

  user: { id: string; public_id: string; name: string; username: string; };
  account: { id: string; userId: string; providerId: string; password: string | null; updatedAt: Date };
  session: { id: string; userId: string; token: string };
  recovery_code: { user_id: string; code_hash: string; created_at: Generated<Date>; used_at: Date | null };
  account_security_event: { id: string; user_id: string; action: "recovery_codes_issued" | "password_recovered" | "password_changed"; created_at: Generated<Date> };
  business: {
    id: string; public_id: string; name: string; timezone: string;
    created_at: Generated<Date>; archived_at: Date | null;
  };
  business_member: {
    business_id: string; user_id: string; role: Role;
    status: "active" | "revoked"; created_at: Generated<Date>;
  };
  business_creation: {
    user_id: string; key: string; request_hash: string; business_id: string;
    created_at: Generated<Date>;
  };
  request_limit: { key: string; count: number; expires_at: Date };
  business_invitation: {
    id: string; business_id: string; inviter_user_id: string; invitee_user_id: string;
    role: "admin" | "operator"; status: "pending" | "accepted" | "revoked" | "expired";
    expires_at: Date; created_at: Generated<Date>; responded_at: Date | null;
  };
  business_audit_log: {
    id: string; business_id: string; actor_user_id: string; action: "invitation_created" | "invitation_accepted" | "invitation_revoked" | "member_revoked" | "member_role_changed" | "connection_connected" | "connection_disconnected";
    target_user_id: string | null; details: string | null; created_at: Generated<Date>;
  };
  business_connection: {
    id: string; business_id: string; platform: "telegram" | "vk"; external_account_id: string | null;
    display_name: string | null; status: "pending" | "connected" | "error" | "disconnected";
    created_at: Generated<Date>; updated_at: Generated<Date>;
  };
  connection_secret: { connection_id: string; encrypted_token: string; key_version: number; updated_at: Generated<Date> };
  lead: {
    id: string; business_id: string; source: "telegram" | "vk" | "max";
    name: string; phone: string | null; message: string | null;
    status: LeadStatus; external_event_id: string | null; created_at: Generated<Date>; updated_at: Generated<Date>;
  };
}
