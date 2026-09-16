ALTER TABLE business_audit_log ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE business_audit_log ADD COLUMN actor_type text NOT NULL DEFAULT 'member' CHECK(actor_type IN ('member','client','system'));
ALTER TABLE business_audit_log ADD COLUMN target_id uuid;
ALTER TABLE business_audit_log ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
CREATE INDEX business_audit_target ON business_audit_log(business_id,target_id,created_at);
