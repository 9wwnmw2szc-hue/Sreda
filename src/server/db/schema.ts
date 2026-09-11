import type { Generated } from "kysely";

export type Role = "owner" | "admin" | "operator";
export interface Database {
  business: {
    id: string; name: string; timezone: string;
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
}
