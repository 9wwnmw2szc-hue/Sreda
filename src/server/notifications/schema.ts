import type { Generated } from "kysely";
export interface NotificationTables {
  notification_binding: {
    business_id: string;
    user_id: string;
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
}
