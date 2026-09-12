ALTER TABLE business_invitation DROP CONSTRAINT invitation_pending_unique;
CREATE UNIQUE INDEX invitation_pending_unique ON business_invitation (business_id, invitee_user_id) WHERE status = 'pending';
CREATE UNIQUE INDEX connection_external_unique ON business_connection (platform, external_account_id) WHERE external_account_id IS NOT NULL;
