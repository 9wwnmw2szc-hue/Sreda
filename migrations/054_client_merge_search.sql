-- Soft-archive for merged clients + audit action for controlled merge.
ALTER TABLE client
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid;

ALTER TABLE client DROP CONSTRAINT IF EXISTS client_merged_into_scope;
ALTER TABLE client
  ADD CONSTRAINT client_merged_into_scope
  FOREIGN KEY (business_id, merged_into_id)
  REFERENCES client (business_id, id);

CREATE INDEX IF NOT EXISTS client_business_active_idx
  ON client (business_id, last_seen_at DESC, id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS product_business_sku_idx
  ON product (business_id, sku)
  WHERE sku IS NOT NULL;

ALTER TABLE business_audit_log DROP CONSTRAINT IF EXISTS business_audit_log_action_check;
ALTER TABLE business_audit_log ADD CONSTRAINT business_audit_log_action_check CHECK (action IN (
  'invitation_created', 'invitation_accepted', 'invitation_revoked', 'member_revoked', 'member_role_changed',
  'connection_connected', 'connection_disconnected', 'lead_taken', 'lead_closed', 'conversation_taken', 'conversation_closed',
  'booking_created', 'booking_rescheduled', 'booking_cancelled', 'booking_completed', 'service_created', 'service_updated',
  'specialist_created', 'specialist_updated', 'post_created', 'post_scheduled', 'post_cancelled', 'post_published',
  'product_created', 'product_updated', 'order_created', 'order_status_changed', 'inventory_adjusted', 'settings_changed',
  'calendar_event_created', 'calendar_event_updated', 'calendar_event_cancelled',
  'analytics_file_uploaded', 'analytics_file_deleted', 'analytics_export_created', 'analytics_ai_created',
  'analytics_import_confirmed', 'client_merged'
));
