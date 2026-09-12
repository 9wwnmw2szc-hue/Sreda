import type { Generated } from "kysely";

export type Role = "owner" | "admin" | "operator";
export type LeadStatus = "new" | "processing" | "closed";
export interface Database {
  user: { id: string; public_id: string; name: string; username: string; };
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
