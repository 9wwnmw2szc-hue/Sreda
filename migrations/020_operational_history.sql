ALTER TABLE lead ADD COLUMN processing_by uuid REFERENCES "user"(id);
ALTER TABLE lead ADD COLUMN processing_at timestamptz;
ALTER TABLE lead ADD COLUMN answers jsonb NOT NULL DEFAULT '{}';
ALTER TABLE communication_conversation ADD CONSTRAINT conversation_business_unique UNIQUE(business_id,id);
CREATE TABLE conversation_read_state (
 business_id uuid NOT NULL, conversation_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES "user"(id),
 read_at timestamptz NOT NULL,PRIMARY KEY(conversation_id,user_id),
 FOREIGN KEY(business_id,conversation_id) REFERENCES communication_conversation(business_id,id),
 FOREIGN KEY(business_id,user_id) REFERENCES business_member(business_id,user_id)
);
ALTER TABLE business_audit_log DROP CONSTRAINT business_audit_log_action_check;
ALTER TABLE business_audit_log ADD CONSTRAINT business_audit_log_action_check CHECK(action IN (
 'invitation_created','invitation_accepted','invitation_revoked','member_revoked','member_role_changed',
 'connection_connected','connection_disconnected','lead_taken','lead_closed','conversation_taken','conversation_closed',
 'booking_created','booking_rescheduled','booking_cancelled','booking_completed','service_created','service_updated',
 'specialist_created','specialist_updated','post_created','post_scheduled','post_cancelled','post_published','settings_changed'
));
