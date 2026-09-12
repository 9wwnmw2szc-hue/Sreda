ALTER TABLE business_audit_log DROP CONSTRAINT business_audit_log_action_check;
ALTER TABLE business_audit_log ADD CONSTRAINT business_audit_log_action_check CHECK (action IN ('invitation_created', 'invitation_accepted', 'invitation_revoked', 'member_revoked', 'member_role_changed'));
